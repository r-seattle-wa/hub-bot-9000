# Hub Bot 9000 - Detection Metrics
# Log-based metrics and detection queries for suspicious activity
# Notification channels can be added later

# =============================================================================
# LOG-BASED METRICS (Detection Signals)
# =============================================================================

# Metric: Hostile crosslinks detected
resource "google_logging_metric" "hostile_crosslinks" {
  name        = "hub-bot/hostile_crosslinks"
  description = "Count of hostile (adversarial/hateful) crosslinks detected"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="hostile_crosslink"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "source_subreddit"
      value_type  = "STRING"
      description = "Subreddit that posted the crosslink"
    }

    labels {
      key         = "classification"
      value_type  = "STRING"
      description = "Tone classification (adversarial/hateful)"
    }
  }

  label_extractors = {
    "source_subreddit" = "EXTRACT(jsonPayload.source_subreddit)"
    "classification"   = "EXTRACT(jsonPayload.classification)"
  }
}

# Metric: Brigade patterns detected
resource "google_logging_metric" "brigade_patterns" {
  name        = "hub-bot/brigade_patterns"
  description = "Count of potential brigading patterns (multiple hostile links from same source)"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="brigade_pattern"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "source_subreddit"
      value_type  = "STRING"
      description = "Source subreddit"
    }

    labels {
      key         = "link_count"
      value_type  = "INT64"
      description = "Number of hostile links"
    }
  }

  label_extractors = {
    "source_subreddit" = "EXTRACT(jsonPayload.source_subreddit)"
    "link_count"       = "EXTRACT(jsonPayload.link_count)"
  }
}

# Metric: Deleted content detected
resource "google_logging_metric" "deleted_content" {
  name        = "hub-bot/deleted_content"
  description = "Count of deleted content found via PullPush"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="deleted_content_detected"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "deleted_count"
      value_type  = "INT64"
      description = "Number of deleted items found"
    }
  }

  label_extractors = {
    "deleted_count" = "EXTRACT(jsonPayload.deleted_count)"
  }
}

# Metric: OSINT flagged content
resource "google_logging_metric" "osint_flagged" {
  name        = "hub-bot/osint_flagged_content"
  description = "Count of flagged content from OSINT analysis"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="osint_flagged_content"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "severity"
      value_type  = "STRING"
      description = "Severity level (low/moderate/severe)"
    }

    labels {
      key         = "reason"
      value_type  = "STRING"
      description = "Reason for flagging"
    }
  }

  label_extractors = {
    "severity" = "EXTRACT(jsonPayload.severity)"
    "reason"   = "EXTRACT(jsonPayload.reason)"
  }
}

# Metric: Sockpuppet detections
resource "google_logging_metric" "sockpuppet_detections" {
  name        = "hub-bot/sockpuppet_detections"
  description = "Count of high-confidence sockpuppet/alt detections"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="behavioral_analysis"
    jsonPayload.sockpuppet_risk="high"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "username"
      value_type  = "STRING"
      description = "Detected username"
    }
  }

  label_extractors = {
    "username" = "EXTRACT(jsonPayload.username)"
  }
}

# Metric: Mod log spam actions
resource "google_logging_metric" "mod_log_spam" {
  name        = "hub-bot/mod_log_spam"
  description = "Count of mod log spam/removal actions found for haters"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="mod_log_spam_found"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "username"
      value_type  = "STRING"
      description = "Username with spam actions"
    }

    labels {
      key         = "spam_count"
      value_type  = "INT64"
      description = "Number of spam actions"
    }
  }

  label_extractors = {
    "username"   = "EXTRACT(jsonPayload.username)"
    "spam_count" = "EXTRACT(jsonPayload.spam_count)"
  }
}

# Metric: Leaderboard updates
resource "google_logging_metric" "leaderboard_updates" {
  name        = "hub-bot/leaderboard_updates"
  description = "Count of hater leaderboard score updates"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="leaderboard_update"
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "type"
      value_type  = "STRING"
      description = "Update type (subreddit/user)"
    }
  }

  label_extractors = {
    "type" = "EXTRACT(jsonPayload.update_type)"
  }
}

# =============================================================================
# ERROR METRICS
# =============================================================================

# Metric: PullPush API errors
resource "google_logging_metric" "pullpush_errors" {
  name        = "hub-bot/pullpush_errors"
  description = "Count of PullPush API errors"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="pullpush_error"
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "error_type"
      value_type  = "STRING"
      description = "Type of error"
    }
  }

  label_extractors = {
    "error_type" = "EXTRACT(jsonPayload.error_type)"
  }
}

# Metric: Gemini API errors
resource "google_logging_metric" "gemini_errors" {
  name        = "hub-bot/gemini_errors"
  description = "Count of Gemini API errors"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    jsonPayload.event="gemini_error"
    severity>=ERROR
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "error_type"
      value_type  = "STRING"
      description = "Type of error"
    }
  }

  label_extractors = {
    "error_type" = "EXTRACT(jsonPayload.error_type)"
  }
}

# Metric: Rate limit hits
resource "google_logging_metric" "rate_limits" {
  name        = "hub-bot/rate_limit_hits"
  description = "Count of rate limit responses (429)"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    httpRequest.status=429
  EOT

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

# =============================================================================
# LOG SINKS (for BigQuery analysis later)
# =============================================================================

# BigQuery dataset for log analysis
resource "google_bigquery_dataset" "hub_bot_logs" {
  dataset_id  = "hub_bot_logs"
  description = "Hub Bot 9000 log data for analysis"
  location    = var.region

  default_table_expiration_ms = var.log_retention_days * 24 * 60 * 60 * 1000

  labels = {
    environment = var.environment
  }
}

# Log sink: All suspicious activity to BigQuery
resource "google_logging_project_sink" "suspicious_activity" {
  name        = "hub-bot-suspicious-activity"
  destination = "bigquery.googleapis.com/projects/${var.project_id}/datasets/${google_bigquery_dataset.hub_bot_logs.dataset_id}"

  filter = <<-EOT
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

  unique_writer_identity = true

  bigquery_options {
    use_partitioned_tables = true
  }
}

# Grant BigQuery write access to log sink
resource "google_bigquery_dataset_iam_member" "log_writer" {
  dataset_id = google_bigquery_dataset.hub_bot_logs.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = google_logging_project_sink.suspicious_activity.writer_identity
}
