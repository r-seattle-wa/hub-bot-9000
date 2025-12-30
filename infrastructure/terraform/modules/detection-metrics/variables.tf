# Hub Bot 9000 - Detection Metrics Module Variables

variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "metric_prefix" {
  description = "Prefix for metric names (e.g., 'hub-bot' creates 'hub-bot/metric_name')"
  type        = string
  default     = "hub-bot"
}

variable "metrics" {
  description = "Map of metrics to create"
  type = map(object({
    description = string
    filter      = string
    metric_kind = optional(string, "DELTA")
    value_type  = optional(string, "INT64")
    unit        = optional(string, "1")
    labels = optional(map(object({
      value_type  = optional(string, "STRING")
      description = optional(string, "")
    })), {})
    label_extractors = optional(map(string), {})
  }))
  default = {}
}

# BigQuery sink configuration
variable "bigquery_dataset" {
  description = "BigQuery dataset ID for log sink (empty to disable)"
  type        = string
  default     = ""
}

variable "sink_name_prefix" {
  description = "Prefix for log sink name"
  type        = string
  default     = "hub-bot-detection"
}

variable "sink_filter" {
  description = "Filter for log sink"
  type        = string
  default     = ""
}
