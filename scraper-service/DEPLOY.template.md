# Deploying Event Scraper to GCP Cloud Run

## Prerequisites

1. Create a GCP project at https://console.cloud.google.com
2. Install Google Cloud CLI: https://cloud.google.com/sdk/docs/install
3. Authenticate: `gcloud auth login`
4. Set project: `gcloud config set project YOUR_PROJECT_ID`

## Enable Required APIs

```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
```

## Set Up Secrets

```bash
# Required: Google API key for Gemini
# Get one at: https://makersuite.google.com/app/apikey
echo -n "YOUR_GOOGLE_API_KEY" | gcloud secrets create GOOGLE_API_KEY --data-file=-

# Optional: Ticketmaster API key (free tier: 5000 req/day)
# Get one at: https://developer.ticketmaster.com/
echo -n "YOUR_TICKETMASTER_KEY" | gcloud secrets create TICKETMASTER_API_KEY --data-file=-

# Optional: API key for scraper authentication
openssl rand -hex 32 | gcloud secrets create SCRAPER_API_KEY --data-file=-
```

## Grant Secret Access to Cloud Run

```bash
# Get the compute service account
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Grant access to secrets
gcloud secrets add-iam-policy-binding GOOGLE_API_KEY \
  --member="serviceAccount:${SA}" --role="roles/secretmanager.secretAccessor"
```

## Deploy

```bash
cd scraper-service

gcloud run deploy event-scraper \
  --source . \
  --region us-west1 \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "RATE_LIMIT=30" \
  --set-secrets "GOOGLE_API_KEY=GOOGLE_API_KEY:latest"
```

## Verify

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe event-scraper --region us-west1 --format="value(status.url)")

# Test endpoints
curl "${SERVICE_URL}/health"
curl "${SERVICE_URL}/events?days=3"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_API_KEY` | Yes | Gemini API for AI scraping |
| `TICKETMASTER_API_KEY` | No | Extra event source |
| `SCRAPER_API_KEY` | No | API authentication |
| `RATE_LIMIT` | No | Requests/minute (default: 30) |

## Cost Estimate

- Cloud Run: ~$0/month (scales to zero)
- Gemini API: ~$0.03/month (2 requests/day)
