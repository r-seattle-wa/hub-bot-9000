# Hub Bot 9000 - Terraform Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-west1"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "gemini_api_key_secret" {
  description = "Secret Manager secret name for Gemini API key (optional)"
  type        = string
  default     = ""
}

variable "scraper_public_access" {
  description = "Allow public access to scraper service"
  type        = bool
  default     = true
}

# Log retention
variable "log_retention_days" {
  description = "Number of days to retain logs in BigQuery"
  type        = number
  default     = 30
}
