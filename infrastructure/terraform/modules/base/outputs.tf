# Hub Bot 9000 - Base Module Outputs

output "artifact_registry_url" {
  description = "Artifact Registry repository URL for pushing images"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.hub_bot.repository_id}"
}

output "artifact_registry_name" {
  description = "Artifact Registry repository name"
  value       = google_artifact_registry_repository.hub_bot.repository_id
}

output "bigquery_dataset_id" {
  description = "BigQuery dataset ID for logs"
  value       = google_bigquery_dataset.logs.dataset_id
}

output "bigquery_dataset_name" {
  description = "BigQuery dataset full name"
  value       = "projects/${var.project_id}/datasets/${google_bigquery_dataset.logs.dataset_id}"
}
