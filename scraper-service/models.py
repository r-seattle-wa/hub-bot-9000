"""Data models for event scraper service."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class Event(BaseModel):
    """Normalized event model matching Devvit UserEvent type."""
    id: str
    title: str
    description: Optional[str] = None
    url: str
    dateStart: str  # ISO date string YYYY-MM-DD
    dateEnd: Optional[str] = None
    location: Optional[str] = None  # Venue name
    submittedBy: str  # Source name (e.g., "Eventbrite", "Ticketmaster")
    submittedAt: str  # ISO datetime
    approved: bool = True  # Scraped events are auto-approved

class EventSource(BaseModel):
    """Event source configuration."""
    name: str
    url: str
    icon: str
    scraper_type: str = "crawl4ai"  # "crawl4ai", "eventbrite_api", "meetup_api", "ticketmaster_api"

class ScraperConfig(BaseModel):
    """Configuration for the scraper."""
    event_sources: list[EventSource] = []
    location: str = "Seattle, WA"
    days_ahead: int = 3
    eventbrite_token: Optional[str] = None
    meetup_api_key: Optional[str] = None
    ticketmaster_api_key: Optional[str] = None
