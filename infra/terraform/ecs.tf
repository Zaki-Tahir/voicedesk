resource "aws_ecr_repository" "app" {
  for_each             = toset(["server", "web"])
  name                 = "${var.project}/${each.key}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep the last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_ecs_cluster" "main" {
  name = local.name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["api", "worker", "web", "migrate"])
  name              = "/ecs/${local.name}/${each.key}"
  retention_in_days = 30
}

locals {
  server_image = "${aws_ecr_repository.app["server"].repository_url}:${var.image_tag}"
  web_image    = "${aws_ecr_repository.app["web"].repository_url}:${var.image_tag}"

  server_env = [
    { name = "NODE_ENV", value = "production" },
    { name = "PUBLIC_URL", value = "https://api.${var.domain_name}" },
    { name = "REDIS_URL", value = "redis://${aws_elasticache_cluster.redis.cache_nodes[0].address}:6379" },
    { name = "CORS_ORIGIN", value = "https://app.${var.domain_name}" },
    { name = "TWILIO_VALIDATE_SIGNATURE", value = "true" },
  ]

  log_config = {
    for name, group in aws_cloudwatch_log_group.app : name => {
      logDriver = "awslogs"
      options = {
        awslogs-group         = group.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = name
      }
    }
  }

  # Container definitions are shared by Terraform and by the deploy workflow, which swaps in new images.
  task_defs = {
    api = {
      cpu    = 512
      memory = 1024
      container = {
        name         = "api"
        image        = local.server_image
        essential    = true
        portMappings = [{ containerPort = 8080 }]
        environment  = local.server_env
        secrets      = local.container_secrets.server
        stopTimeout  = 120 # let in-progress calls wrap up on deploy
      }
    }
    worker = {
      cpu    = 256
      memory = 512
      container = {
        name        = "worker"
        image       = local.server_image
        essential   = true
        command     = ["node", "dist/worker.js"]
        environment = local.server_env
        secrets     = local.container_secrets.server
      }
    }
    migrate = {
      cpu    = 256
      memory = 512
      container = {
        name        = "migrate"
        image       = local.server_image
        essential   = true
        command     = ["npx", "prisma", "migrate", "deploy"]
        environment = local.server_env
        secrets     = local.container_secrets.server
      }
    }
    web = {
      cpu    = 256
      memory = 512
      container = {
        name         = "web"
        image        = local.web_image
        essential    = true
        portMappings = [{ containerPort = 3000 }]
        environment  = [{ name = "API_URL", value = "https://api.${var.domain_name}" }]
        secrets      = local.container_secrets.web
      }
    }
  }
}

resource "aws_ecs_task_definition" "app" {
  for_each                 = local.task_defs
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([merge(each.value.container, { logConfiguration = local.log_config[each.key] })])
}

locals {
  services = {
    api    = { count = var.api_desired_count, target_group = aws_lb_target_group.api.arn, port = 8080 }
    worker = { count = var.worker_desired_count, target_group = null, port = null }
    web    = { count = var.web_desired_count, target_group = aws_lb_target_group.web.arn, port = 3000 }
  }
}

resource "aws_ecs_service" "app" {
  for_each        = local.services
  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app[each.key].arn
  desired_count   = each.value.count
  launch_type     = "FARGATE"

  # Rolling deploys: start new tasks before stopping old ones, and roll back automatically
  # if the new version never becomes healthy.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets         = module.vpc.private_subnets
    security_groups = [aws_security_group.tasks.id]
  }

  dynamic "load_balancer" {
    for_each = each.value.target_group == null ? [] : [each.value]
    content {
      target_group_arn = load_balancer.value.target_group
      container_name   = each.key
      container_port   = load_balancer.value.port
    }
  }

  lifecycle {
    # The deploy workflow registers new task definition revisions; don't fight it.
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.https]
}

# Scale the API on CPU. Each live call costs some CPU for audio relay, so this tracks call volume.
resource "aws_appautoscaling_target" "api" {
  service_namespace  = "ecs"
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.app["api"].name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.api_desired_count
  max_capacity       = var.api_desired_count * 4
}

resource "aws_appautoscaling_policy" "api_cpu" {
  name               = "${local.name}-api-cpu"
  service_namespace  = aws_appautoscaling_target.api.service_namespace
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  policy_type        = "TargetTrackingScaling"

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
