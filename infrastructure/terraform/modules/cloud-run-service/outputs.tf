# Hub Bot 9000 - Cloud Run Service Module Outputs

output "service_url" {
  description = "Cloud Run service URL"
  value       = google_cloud_run_v2_service.service.uri
}

output "service_name" {
  description = "Cloud Run service name"
  value       = google_cloud_run_v2_service.service.name
}

output "service_account_email" {
  description = "Service account email"
  value       = google_service_account.service.email
}

output "service_account_id" {
  description = "Service account unique ID"
  value       = google_service_account.service.unique_id
}
