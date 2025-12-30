# Hub Bot 9000 - GCP Infrastructure

Modular Terraform configuration for deploying Hub Bot 9000 services on Google Cloud Platform.

## Integration Point

**The `scraper_url` output is the URL to configure in your Devvit app settings.**

Anyone can deploy their own instance with custom features and use their own URL.

## Architecture

```
infrastructure/terraform/
  main.tf                 # Root composition (uses modules)
  variables.tf            # Input variables
  outputs.tf              # Output values (scraper_url, etc.)
  terraform.tfvars.example
  modules/
    base/               # Shared infra (APIs, Registry, BigQuery)
    cloud-run-service/  # Reusable Cloud Run deployment
    detection-metrics/  # Log-based metrics and sinks
  examples/
    enrichment-service/ # Template for custom services
```

## Quick Start

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

# Get the scraper URL
terraform output scraper_url
```

## Resources Created

### Base Module
- **GCP APIs** - Cloud Run, Logging, Monitoring, Build, Secrets, Artifact Registry
- **Artifact Registry** - Container image storage
- **BigQuery Dataset** - Log storage for analysis

### Scraper Service
- **Cloud Run Service** - Event scraper API with Gemini fallback
- **Service Account** - With Secret Manager access
- **IAM** - Public access (rate-limited internally)

### Detection Metrics
- **Log-based Metrics** - Brigade, sockpuppet, error tracking
- **BigQuery Sink** - Routes suspicious activity to BigQuery

## Deploying the Scraper Container

After Terraform creates infrastructure:

```bash
cd ../../scraper-service

# Build
docker build -t us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000/scraper:latest .

# Push
docker push us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000/scraper:latest

# Deploy new revision
gcloud run services update hub-bot-scraper   --image us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000/scraper:latest   --region us-west1
```

## Adding Custom Services

Want to add your own enrichment service? See `examples/enrichment-service/`.

```hcl
# In main.tf, add:
module "my_enrichment" {
  source = "./modules/cloud-run-service"

  project_id         = var.project_id
  region             = var.region
  service_name       = "my-enrichment-service"
  service_account_id = "my-enrichment-sa"
  container_image    = "${module.base.artifact_registry_url}/my-enrichment:latest"

  env_vars = {
    SCRAPER_URL = module.scraper.service_url  # Chain to scraper
  }

  public_access = true
}
```

## Detection Metrics

| Metric | Description |
|--------|-------------|
| `hub-bot/hostile_crosslinks` | Hostile crosslinks detected |
| `hub-bot/brigade_patterns` | Brigading patterns |
| `hub-bot/sockpuppet_detections` | High-confidence sockpuppets |
| `hub-bot/api_errors` | PullPush/Gemini API errors |
| `hub-bot/rate_limits` | Rate limit responses (429) |

### Viewing Metrics

1. Go to **GCP Console > Monitoring > Metrics Explorer**
2. Search for `hub-bot/` to see all custom metrics

### BigQuery Analysis

```sql
-- Hostile crosslinks by source
SELECT
  jsonPayload.source_subreddit,
  jsonPayload.classification,
  COUNT(*) as count
FROM your_project.hub_bot_logs.suspicious_activity_*
WHERE jsonPayload.event = 'hostile_crosslink'
GROUP BY 1, 2
ORDER BY count DESC
```

## Cost Estimates

| Resource | Estimated Cost |
|----------|---------------|
| Cloud Run | ~$0/month (scales to zero) |
| BigQuery | ~$0.10/month (small logs) |
| Artifact Registry | ~$0.10/month |
| Cloud Logging | Free (under 50GB) |
| **Total** | **< $1/month** |

## Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `project_id` | GCP Project ID | (required) |
| `region` | GCP Region | `us-west1` |
| `environment` | Environment name | `prod` |
| `gemini_api_key_secret` | Secret Manager secret name | `""` |
| `scraper_public_access` | Allow public access | `true` |
| `log_retention_days` | BigQuery retention | `30` |

## Cleanup

```bash
terraform destroy
```
