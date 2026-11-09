# Application secrets live in one JSON secret. Terraform creates it empty; set the values once with:
#   aws secretsmanager put-secret-value --secret-id <name> --secret-string file://secrets.json
# Keys: DATABASE_URL, OPENAI_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
#       ADMIN_API_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
}

locals {
  secret_keys = {
    server = ["DATABASE_URL", "OPENAI_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "ADMIN_API_TOKEN", "GOOGLE_SERVICE_ACCOUNT_JSON"]
    web    = ["ADMIN_API_TOKEN"]
  }

  # ECS pulls individual JSON keys with the "<arn>:<key>::" syntax.
  container_secrets = {
    for app, keys in local.secret_keys : app => [
      for key in keys : { name = key, valueFrom = "${aws_secretsmanager_secret.app.arn}:${key}::" }
    ]
  }
}
