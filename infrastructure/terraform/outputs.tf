# Hub Bot 9000 - Terraform Outputs
#
# INTEGRATION: Use scraper_url in your Devvit app settings
# Anyone can deploy their own and use a different URL

output "scraper_url" {
  description = "Cloud Run scraper service URL - configure this in your Devvit apps"
  value       = module.scraper.service_url
}

output "artifact_registry" {
  description = "Artifact Registry URL for pushing container images"
  value       = module.base.artifact_registry_url
}

output "bigquery_dataset" {
  description = "BigQuery dataset for log analysis"
  value       = module.base.bigquery_dataset_id
}

output "log_metrics" {
  description = "Log-based metrics created for monitoring"
  value       = module.detection_metrics.metric_names
}

output "service_account" {
  description = "Scraper service account email"
  value       = module.scraper.service_account_email
}
