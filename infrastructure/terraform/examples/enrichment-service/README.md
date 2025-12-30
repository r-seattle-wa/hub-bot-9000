# Example: Custom Enrichment Service

This example shows how to deploy your own Cloud Run service that integrates with Hub Bot 9000.

## Use Cases

- **Event enrichment**: Add AI analysis to scraped events
- **Trigger detection**: Watch for specific patterns and send alerts
- **Custom scrapers**: Add new event sources
- **Webhook handlers**: Process external webhooks

## Setup

1. Copy this directory to your own location
2. Build your Docker container (see `Dockerfile.example`)
3. Deploy:

```bash
# Initialize
terraform init

# Plan (check what will be created)
terraform plan -var="project_id=YOUR_PROJECT" -var="artifact_registry_url=us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000"

# Apply
terraform apply -var="project_id=YOUR_PROJECT" -var="artifact_registry_url=us-west1-docker.pkg.dev/YOUR_PROJECT/hub-bot-9000"
```

## Integration

After deployment, you get a Cloud Run URL. Use this URL:

1. **In Devvit app settings**: Configure as an alternative/additional scraper URL
2. **As a webhook endpoint**: Send events from other services
3. **Chain to scraper**: Set `SCRAPER_URL` env var to call the main scraper

## Container Requirements

Your container should:

1. Expose an HTTP endpoint (Cloud Run handles HTTPS)
2. Return JSON responses
3. Use structured logging for metrics:

```python
import json

# Log events for metrics
print(json.dumps({"event": "processed", "type": "enrichment"}))
```

## API Contract

To integrate with the hub-bot ecosystem, return events in this format:

```json
{
  "events": [
    {
      "id": "unique-id",
      "title": "Event Title",
      "description": "Optional description",
      "url": "https://example.com/event",
      "dateStart": "2025-01-15",
      "dateEnd": null,
      "location": "Seattle, WA",
      "submittedBy": "my-enrichment",
      "submittedAt": "2025-01-10T12:00:00Z",
      "approved": true
    }
  ]
}
```
