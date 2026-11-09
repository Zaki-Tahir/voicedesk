output "load_balancer_dns" {
  description = "Point api.<domain> and app.<domain> at this (CNAME or Route 53 alias)"
  value       = aws_lb.main.dns_name
}

output "twilio_voice_webhook" {
  description = "Set this as the 'A call comes in' webhook on the Twilio number"
  value       = "https://api.${var.domain_name}/twilio/voice"
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "github_deploy_role_arn" {
  description = "Save as the AWS_DEPLOY_ROLE_ARN variable on the GitHub environment"
  value       = aws_iam_role.github_deploy.arn
}

output "app_secret_name" {
  value = aws_secretsmanager_secret.app.name
}

output "database_endpoint" {
  value = aws_db_instance.postgres.address
}

output "database_master_secret_arn" {
  description = "Generated master password; use it to build DATABASE_URL in the app secret"
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
}

output "ecs" {
  description = "Values the deploy workflow needs"
  value = {
    cluster         = aws_ecs_cluster.main.name
    private_subnets = module.vpc.private_subnets
    security_group  = aws_security_group.tasks.id
  }
}
