# Hub Bot 9000 - Base Module Variables

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
}

variable "registry_name" {
  description = "Artifact Registry repository name"
  type        = string
  default     = "hub-bot-9000"
}

variable "bigquery_dataset_id" {
  description = "BigQuery dataset ID for logs"
  type        = string
  default     = "hub_bot_logs"
}

variable "log_retention_days" {
  description = "Number of days to retain logs in BigQuery"
  type        = number
  default     = 30
}

variable "enabled_apis" {
  description = "GCP APIs to enable"
  type        = list(string)
  default = [
    "run.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
  ]
}
