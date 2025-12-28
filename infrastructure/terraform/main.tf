# Hub Bot 9000 - GCP Infrastructure
# Terraform configuration for Cloud Run, Logging, Monitoring, and Alerting

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment for remote state storage
  # backend "gcs" {
  #   bucket = "hub-bot-9000-terraform-state"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "cloudbuild.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# Artifact Registry for container images
resource "google_artifact_registry_repository" "hub_bot" {
  location      = var.region
  repository_id = "hub-bot-9000"
  description   = "Container images for Hub Bot 9000 services"
  format        = "DOCKER"

  depends_on = [google_project_service.apis]
}

# Cloud Run service for event scraper
resource "google_cloud_run_v2_service" "scraper" {
  name     = "hub-bot-scraper"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/hub-bot-9000/scraper:latest"

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "ENVIRONMENT"
        value = var.environment
      }

      # Gemini API key from Secret Manager
      dynamic "env" {
        for_each = var.gemini_api_key_secret != "" ? [1] : []
        content {
          name = "GOOGLE_API_KEY"
          value_source {
            secret_key_ref {
              secret  = var.gemini_api_key_secret
              version = "latest"
            }
          }
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    timeout = "300s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_service.apis]
}

# Allow unauthenticated access to scraper (rate-limited internally)
resource "google_cloud_run_v2_service_iam_member" "scraper_public" {
  count = var.scraper_public_access ? 1 : 0

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.scraper.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Service account for Cloud Run
resource "google_service_account" "scraper_sa" {
  account_id   = "hub-bot-scraper"
  display_name = "Hub Bot Scraper Service Account"
}

# Grant Secret Manager access to service account
resource "google_secret_manager_secret_iam_member" "scraper_secret_access" {
  count = var.gemini_api_key_secret != "" ? 1 : 0

  secret_id = var.gemini_api_key_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.scraper_sa.email}"
}
