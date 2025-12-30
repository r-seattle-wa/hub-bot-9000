# Hub Bot 9000 - Cloud Run Service Module Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-west1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
}

variable "service_account_id" {
  description = "Service account ID (will be created)"
  type        = string
}

variable "container_image" {
  description = "Container image URL"
  type        = string
}

# Resource limits
variable "cpu" {
  description = "CPU limit"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit"
  type        = string
  default     = "512Mi"
}

# Scaling
variable "min_instances" {
  description = "Minimum instance count (0 = scale to zero)"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum instance count"
  type        = number
  default     = 3
}

variable "timeout" {
  description = "Request timeout"
  type        = string
  default     = "300s"
}

# Environment variables
variable "env_vars" {
  description = "Static environment variables"
  type        = map(string)
  default     = {}
}

variable "secret_env_vars" {
  description = "Environment variables from Secret Manager"
  type = map(object({
    secret_name = string
    version     = optional(string, "latest")
  }))
  default = {}
}

# Access control
variable "public_access" {
  description = "Allow unauthenticated access"
  type        = bool
  default     = false
}

variable "invoker_service_accounts" {
  description = "Service accounts allowed to invoke this service"
  type        = list(string)
  default     = []
}
