# Example: Custom Enrichment Service
# Copy this to your own directory and customize
#
# This shows how to add a custom Cloud Run service that:
# 1. Receives webhooks or API calls
# 2. Enriches data using AI (Gemini)
# 3. Writes events to the wiki feed

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-west1"
}

variable "artifact_registry_url" {
  description = "Artifact Registry URL from base module"
  type        = string
}

variable "scraper_url" {
  description = "Scraper service URL to chain requests to"
  type        = string
  default     = ""
}

variable "gemini_api_key_secret" {
  description = "Secret Manager secret name for Gemini API key"
  type        = string
  default     = ""
}

# Use the cloud-run-service module from the parent
module "enrichment" {
  source = "../../modules/cloud-run-service"

  project_id         = var.project_id
  region             = var.region
  service_name       = "my-enrichment-service"
  service_account_id = "my-enrichment-sa"
  container_image    = "${var.artifact_registry_url}/my-enrichment:latest"

  cpu           = "1"
  memory        = "256Mi" # Enrichment services can be lighter
  min_instances = 0
  max_instances = 2
  timeout       = "60s"

  env_vars = {
    SCRAPER_URL = var.scraper_url
  }

  secret_env_vars = var.gemini_api_key_secret != "" ? {
    GOOGLE_API_KEY = { secret_name = var.gemini_api_key_secret }
  } : {}

  public_access = true
}

# Add your own detection metrics
module "my_metrics" {
  source = "../../modules/detection-metrics"

  project_id    = var.project_id
  metric_prefix = "my-enrichment"

  metrics = {
    events_processed = {
      description = "Events processed by enrichment service"
      filter      = "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"my-enrichment-service\" jsonPayload.event=\"processed\""
    }

    enrichment_errors = {
      description = "Enrichment processing errors"
      filter      = "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"my-enrichment-service\" severity>=ERROR"
    }
  }
}

output "service_url" {
  description = "Enrichment service URL - use this as your webhook endpoint"
  value       = module.enrichment.service_url
}
