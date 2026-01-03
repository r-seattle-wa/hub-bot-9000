"""Data models for event scraper service."""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Literal

# =============================================================================
# Event Models
# =============================================================================

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
    scraper_type: str = "crawl4ai"


class ScraperConfig(BaseModel):
    """Configuration for the scraper."""
    event_sources: list[EventSource] = []
    location: str = "Seattle, WA"
    days_ahead: int = 3
    eventbrite_token: Optional[str] = None
    meetup_api_key: Optional[str] = None
    ticketmaster_api_key: Optional[str] = None


# =============================================================================
# Content Analysis Models
# =============================================================================

class ContentAnalysisRequest(BaseModel):
    """Request for unified content analysis."""
    type: Literal["comment", "post"]
    body: str
    author: str
    subreddit: str
    id: str  # Reddit thing ID (t1_xxx or t3_xxx)
    title: Optional[str] = None  # Post title (for posts only)
    parent_id: Optional[str] = None  # Parent comment/post ID


class HaikuDetection(BaseModel):
    """Haiku detection result."""
    detected: bool
    lines: Optional[list[str]] = None
    syllables: Optional[list[int]] = None


class FarewellDetection(BaseModel):
    """Farewell/unsubscribe detection result."""
    detected: bool
    confidence: float = 0.0
    matched_patterns: list[str] = []


class PoliticalComplaint(BaseModel):
    """Political complaint detection result."""
    detected: bool
    complaint_type: Optional[Literal["right-leaning", "left-leaning", "general"]] = None


class CrosslinkDetection(BaseModel):
    """Crosslink detection result."""
    detected: bool
    links: list[dict] = []  # [{subreddit, full_url, post_id?, comment_id?}]


class ToneClassification(BaseModel):
    """Tone classification result."""
    tone: Literal["polite", "neutral", "frustrated", "hostile", "dramatic"]
    confidence: float
    classification: Literal["friendly", "neutral", "adversarial", "hateful"]
    trigger_phrase: Optional[str] = None


class ContentAnalysisResponse(BaseModel):
    """Response from unified content analysis."""
    id: str
    type: str
    subreddit: str
    author: str
    detections: dict  # All detection results
    events_emitted: list[str] = []  # List of event types emitted to wiki queue
    processing_time_ms: int = 0


# =============================================================================
# Wiki Queue Models (for Devvit apps to consume)
# =============================================================================

class WikiQueueEvent(BaseModel):
    """Event queued for Devvit app to process."""
    id: str
    type: Literal[
        "haiku_detection",
        "farewell_announcement",
        "political_complaint",
        "hostile_crosslink",
        "brigade_pattern",
    ]
    created_at: str  # ISO datetime
    expires_at: str  # ISO datetime
    subreddit: str
    content_id: str  # Reddit thing ID
    content_type: Literal["comment", "post"]
    author: str
    data: dict  # Type-specific data
    processed: bool = False
