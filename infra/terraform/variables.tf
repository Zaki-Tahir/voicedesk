variable "project" {
  type    = string
  default = "voicedesk"
}

variable "environment" {
  description = "staging or production"
  type        = string
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "github_repository" {
  description = "owner/repo allowed to deploy through GitHub Actions OIDC"
  type        = string
}

variable "domain_name" {
  description = "Base domain. The API is served at api.<domain> and the dashboard at app.<domain>."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate covering api.<domain> and app.<domain>"
  type        = string
}

variable "image_tag" {
  description = "Image tag for the first deploy. CI/CD updates task definitions after that."
  type        = string
  default     = "latest"
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "worker_desired_count" {
  type    = number
  default = 1
}

variable "web_desired_count" {
  type    = number
  default = 1
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.micro"
}
