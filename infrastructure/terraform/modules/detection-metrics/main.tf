# Hub Bot 9000 - Detection Metrics Module
# Reusable module for creating log-based metrics and sinks

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# Create log-based metrics from configuration
resource "google_logging_metric" "metrics" {
  for_each = var.metrics

  project     = var.project_id
  name        = "${var.metric_prefix}/${each.key}"
  description = each.value.description
  filter      = each.value.filter

  metric_descriptor {
    metric_kind = lookup(each.value, "metric_kind", "DELTA")
    value_type  = lookup(each.value, "value_type", "INT64")
    unit        = lookup(each.value, "unit", "1")

    dynamic "labels" {
      for_each = lookup(each.value, "labels", {})
      content {
        key         = labels.key
        value_type  = lookup(labels.value, "value_type", "STRING")
        description = lookup(labels.value, "description", "")
      }
    }
  }

  label_extractors = lookup(each.value, "label_extractors", {})
}

# Log sink to BigQuery (optional)
resource "google_logging_project_sink" "bigquery" {
  count = var.bigquery_dataset != "" ? 1 : 0

  project     = var.project_id
  name        = "${var.sink_name_prefix}-sink"
  destination = "bigquery.googleapis.com/projects/${var.project_id}/datasets/${var.bigquery_dataset}"

  filter = var.sink_filter

  unique_writer_identity = true

  bigquery_options {
    use_partitioned_tables = true
  }
}

# Grant BigQuery write access to log sink
resource "google_bigquery_dataset_iam_member" "log_writer" {
  count = var.bigquery_dataset != "" ? 1 : 0

  project    = var.project_id
  dataset_id = var.bigquery_dataset
  role       = "roles/bigquery.dataEditor"
  member     = google_logging_project_sink.bigquery[0].writer_identity
}
