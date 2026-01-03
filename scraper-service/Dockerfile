FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py .
COPY scrapers/ ./scrapers/
COPY detectors/ ./detectors/

# Expose port
EXPOSE 8080

# Run with uvicorn
CMD ["python", "main.py"]
