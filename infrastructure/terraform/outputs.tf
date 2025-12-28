# Hub Bot 9000 - Terraform Outputs

output "scraper_url" {
  description = "Cloud Run scraper service URL"
  value       = google_cloud_run_v2_service.scraper.uri
}

output "artifact_registry" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hub_bot.repository_id}"
}

output "bigquery_dataset" {
  description = "BigQuery dataset for log analysis"
  value       = google_bigquery_dataset.hub_bot_logs.dataset_id
}

output "log_metrics" {
  description = "Log-based metrics created"
  value = {
    hostile_crosslinks = google_logging_metric.hostile_crosslinks.name
    brigade_patterns   = google_logging_metric.brigade_patterns.name
    deleted_content    = google_logging_metric.deleted_content.name
    osint_flagged      = google_logging_metric.osint_flagged.name
    sockpuppets        = google_logging_metric.sockpuppet_detections.name
    mod_log_spam       = google_logging_metric.mod_log_spam.name
    pullpush_errors    = google_logging_metric.pullpush_errors.name
    gemini_errors      = google_logging_metric.gemini_errors.name
    rate_limits        = google_logging_metric.rate_limits.name
  }
}

output "service_account" {
  description = "Scraper service account email"
  value       = google_service_account.scraper_sa.email
}
