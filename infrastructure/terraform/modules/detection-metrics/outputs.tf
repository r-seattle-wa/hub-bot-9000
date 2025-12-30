# Hub Bot 9000 - Detection Metrics Module Outputs

output "metric_names" {
  description = "Map of metric keys to full metric names"
  value = {
    for k, v in google_logging_metric.metrics : k => v.name
  }
}

output "sink_writer_identity" {
  description = "Service account identity for the log sink"
  value       = var.bigquery_dataset != "" ? google_logging_project_sink.bigquery[0].writer_identity : null
}
