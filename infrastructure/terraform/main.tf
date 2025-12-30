# Hub Bot 9000 - GCP Infrastructure
# Modular Terraform for Cloud Run services
#
# INTEGRATION POINT: The scraper_url output is the URL to configure in your apps.
# Anyone can deploy their own instance and use their URL instead.

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

# =============================================================================
# BASE INFRASTRUCTURE (APIs, Registry, BigQuery)
# =============================================================================

module "base" {
  source = "./modules/base"

  project_id          = var.project_id
  region              = var.region
  environment         = var.environment
  registry_name       = "hub-bot-9000"
  bigquery_dataset_id = "hub_bot_logs"
  log_retention_days  = var.log_retention_days
}

# =============================================================================
# EVENT SCRAPER SERVICE
# This is the main integration point - the URL goes into Devvit app settings
# =============================================================================

module "scraper" {
  source = "./modules/cloud-run-service"

  project_id         = var.project_id
  region             = var.region
  service_name       = "hub-bot-scraper"
  service_account_id = "hub-bot-scraper"
  container_image    = "${module.base.artifact_registry_url}/scraper:latest"

  cpu           = "1"
  memory        = "512Mi"
  min_instances = 0
  max_instances = 3
  timeout       = "300s"

  env_vars = {
    ENVIRONMENT = var.environment
  }

  secret_env_vars = var.gemini_api_key_secret != "" ? {
    GOOGLE_API_KEY = { secret_name = var.gemini_api_key_secret }
  } : {}

  public_access = var.scraper_public_access
}

# =============================================================================
# DETECTION METRICS (Optional - for observability)
# =============================================================================

module "detection_metrics" {
  source = "./modules/detection-metrics"

  project_id       = var.project_id
  metric_prefix    = "hub-bot"
  bigquery_dataset = module.base.bigquery_dataset_id
  sink_name_prefix = "hub-bot-suspicious-activity"

  sink_filter = <<-EOT
    resource.type="cloud_run_revision"
    (
      jsonPayload.event="hostile_crosslink" OR
      jsonPayload.event="brigade_pattern" OR
      jsonPayload.event="osint_flagged_content" OR
      jsonPayload.event="behavioral_analysis" OR
      jsonPayload.event="deleted_content_detected" OR
      jsonPayload.event="mod_log_spam_found"
    )
  EOT

  metrics = {
    hostile_crosslinks = {
      description = "Hostile crosslinks detected"
      filter      = "resource.type=\"cloud_run_revision\" jsonPayload.event=\"hostile_crosslink\""
      labels = {
        source_subreddit = { description = "Subreddit that posted the crosslink" }
        classification   = { description = "Tone classification" }
      }
      label_extractors = {
        "source_subreddit" = "EXTRACT(jsonPayload.source_subreddit)"
        "classification"   = "EXTRACT(jsonPayload.classification)"
      }
    }

    brigade_patterns = {
      description = "Brigading patterns detected"
      filter      = "resource.type=\"cloud_run_revision\" jsonPayload.event=\"brigade_pattern\""
      labels = {
        source_subreddit = { description = "Source subreddit" }
      }
      label_extractors = {
        "source_subreddit" = "EXTRACT(jsonPayload.source_subreddit)"
      }
    }

    sockpuppet_detections = {
      description = "High-confidence sockpuppet detections"
      filter      = "resource.type=\"cloud_run_revision\" jsonPayload.event=\"behavioral_analysis\" jsonPayload.sockpuppet_risk=\"high\""
      labels = {
        username = { description = "Detected username" }
      }
      label_extractors = {
        "username" = "EXTRACT(jsonPayload.username)"
      }
    }

    api_errors = {
      description = "API errors (PullPush, Gemini)"
      filter      = "resource.type=\"cloud_run_revision\" (jsonPayload.event=\"pullpush_error\" OR jsonPayload.event=\"gemini_error\") severity>=ERROR"
      labels = {
        error_type = { description = "Type of error" }
      }
      label_extractors = {
        "error_type" = "EXTRACT(jsonPayload.error_type)"
      }
    }

    rate_limits = {
      description = "Rate limit responses (429)"
      filter      = "resource.type=\"cloud_run_revision\" httpRequest.status=429"
    }
  }
}

# =============================================================================
# CUSTOM SERVICES - Add your own enrichment/trigger services below
# =============================================================================

# Example: Uncomment to add a custom enrichment service
# module "my_enrichment" {
#   source = "./modules/cloud-run-service"
#
#   project_id         = var.project_id
#   region             = var.region
#   service_name       = "my-enrichment-service"
#   service_account_id = "my-enrichment-sa"
#   container_image    = "${module.base.artifact_registry_url}/my-enrichment:latest"
#
#   env_vars = {
#     SCRAPER_URL = module.scraper.service_url  # Chain to scraper
#   }
#
#   public_access = true  # Or restrict to specific callers
# }
