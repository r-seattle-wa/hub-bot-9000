# Hub Bot 9000 - GCP Infrastructure

Terraform configuration for deploying Hub Bot 9000 infrastructure on Google Cloud Platform.

## Resources Created

### Compute
- **Cloud Run Service** - Event scraper API
- **Artifact Registry** - Container image storage

### Observability
- **Log-based Metrics** - Detection signals for suspicious activity
- **BigQuery Dataset** - Log storage for analysis
- **Log Sink** - Routes suspicious activity logs to BigQuery

### Detection Metrics

| Metric | Description |
|--------|-------------|
| `hub-bot/hostile_crosslinks` | Hostile (adversarial/hateful) crosslinks detected |
| `hub-bot/brigade_patterns` | Potential brigading patterns |
| `hub-bot/deleted_content` | Deleted content found via PullPush |
| `hub-bot/osint_flagged_content` | OSINT flagged content by severity |
| `hub-bot/sockpuppet_detections` | High-confidence sockpuppet detections |
| `hub-bot/mod_log_spam` | Mod log spam actions for haters |
| `hub-bot/leaderboard_updates` | Leaderboard score updates |
| `hub-bot/pullpush_errors` | PullPush API errors |
| `hub-bot/gemini_errors` | Gemini API errors |
| `hub-bot/rate_limit_hits` | Rate limit responses (429) |

## Prerequisites

1. [Terraform](https://terraform.io) >= 1.0
2. [gcloud CLI](https://cloud.google.com/sdk/gcloud)
3. GCP Project with billing enabled

## Setup

```bash
cd infrastructure/terraform

# Authenticate
gcloud auth application-default login

# Copy and edit variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project ID

# Initialize
terraform init

# Preview changes
terraform plan

# Apply
terraform apply
```

## Deploying the Scraper

After Terraform creates the infrastructure:

```bash
# Build and push container
cd ../../scraper-service

# Tag for Artifact Registry
docker build -t us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000/scraper:latest .

# Push
docker push us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000/scraper:latest

# Deploy new revision
gcloud run services update hub-bot-scraper --image us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000/scraper:latest
```

## Viewing Metrics

### Cloud Console

1. Go to **Monitoring > Metrics Explorer**
2. Search for `hub-bot/` to see all custom metrics
3. Create dashboards as needed

### BigQuery

```sql
-- View hostile crosslinks by source
SELECT
  jsonPayload.source_subreddit,
  jsonPayload.classification,
  COUNT(*) as count
FROM `your-project.hub_bot_logs.suspicious_activity_*`
WHERE jsonPayload.event = 'hostile_crosslink'
GROUP BY 1, 2
ORDER BY count DESC
```

## Logging Events

The apps should emit structured logs with these events:

```typescript
// Hostile crosslink detected
console.log(JSON.stringify({
  event: 'hostile_crosslink',
  source_subreddit: 'example',
  classification: 'adversarial',
  target_post: 't3_abc123',
}));

// Brigade pattern detected
console.log(JSON.stringify({
  event: 'brigade_pattern',
  source_subreddit: 'example',
  link_count: 5,
}));

// OSINT flagged content
console.log(JSON.stringify({
  event: 'osint_flagged_content',
  username: 'example_user',
  severity: 'severe',
  reason: 'harassment',
}));

// Behavioral analysis result
console.log(JSON.stringify({
  event: 'behavioral_analysis',
  username: 'example_user',
  sockpuppet_risk: 'high',
  similar_to: 'other_user',
}));
```

## Cost Estimates

- **Cloud Run**: Pay per request, ~$0.00001 per request
- **BigQuery**: $5/TB stored, $5/TB queried
- **Cloud Logging**: First 50GB/month free, then $0.50/GB
- **Artifact Registry**: $0.10/GB stored

For typical usage (~10k requests/month), expect < $5/month.

## Adding Notifications Later

When ready to add alert notifications:

1. Create notification channels (email, Slack, PagerDuty, etc.)
2. Create alert policies using the log-based metrics
3. Example Slack integration:

```hcl
resource "google_monitoring_notification_channel" "slack" {
  type         = "slack"
  display_name = "Hub Bot Alerts"

  labels = {
    channel_name = "#hub-bot-alerts"
  }

  sensitive_labels {
    auth_token = var.slack_webhook_token
  }
}
```

## Cleanup

```bash
terraform destroy
```
