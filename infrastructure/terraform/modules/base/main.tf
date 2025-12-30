# Hub Bot 9000 - Base Infrastructure Module
# Shared resources: APIs, Artifact Registry, service accounts

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset(var.enabled_apis)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# Artifact Registry for container images
resource "google_artifact_registry_repository" "hub_bot" {
  project       = var.project_id
  location      = var.region
  repository_id = var.registry_name
  description   = "Container images for Hub Bot 9000 services"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# BigQuery dataset for log analysis
resource "google_bigquery_dataset" "logs" {
  project     = var.project_id
  dataset_id  = var.bigquery_dataset_id
  description = "Hub Bot 9000 log data for analysis"
  location    = var.region

  default_table_expiration_ms = var.log_retention_days * 24 * 60 * 60 * 1000

  labels = {
    environment = var.environment
  }

  depends_on = [google_project_service.apis]
}
