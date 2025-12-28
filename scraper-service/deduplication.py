"""Event deduplication logic using fuzzy matching."""
from fuzzywuzzy import fuzz
from models import Event
from datetime import datetime

def deduplicate_events(events: list[Event], similarity_threshold: int = 80) -> list[Event]:
    """
    Remove duplicate events based on title similarity and date.

    Args:
        events: List of events to deduplicate
        similarity_threshold: Minimum similarity score (0-100) to consider duplicates

    Returns:
        Deduplicated list of events
    """
    if not events:
        return []

    deduplicated = []
    seen_keys = set()

    for event in events:
        # Create a normalized key for exact matching
        normalized_title = normalize_title(event.title)
        date_key = event.dateStart
        exact_key = f"{normalized_title}:{date_key}"

        # Check for exact duplicates first
        if exact_key in seen_keys:
            continue

        # Check for fuzzy duplicates
        is_duplicate = False
        for existing in deduplicated:
            # Only compare events on the same date
            if existing.dateStart != event.dateStart:
                continue

            # Calculate title similarity
            similarity = fuzz.ratio(normalized_title, normalize_title(existing.title))

            if similarity >= similarity_threshold:
                is_duplicate = True
                # Keep the one with more information (longer description)
                if event.description and len(event.description) > len(existing.description or ""):
                    deduplicated.remove(existing)
                    deduplicated.append(event)
                    seen_keys.add(exact_key)
                break

        if not is_duplicate:
            deduplicated.append(event)
            seen_keys.add(exact_key)

    return deduplicated

def normalize_title(title: str) -> str:
    """Normalize event title for comparison."""
    # Lowercase
    normalized = title.lower()

    # Remove common prefixes/suffixes
    remove_phrases = [
        "free:", "free ", "sold out:", "sold out ",
        "cancelled:", "cancelled ", "postponed:",
        "- seattle", "| seattle", "(seattle)",
        "- wa", "| wa",
    ]
    for phrase in remove_phrases:
        normalized = normalized.replace(phrase, "")

    # Remove extra whitespace
    normalized = " ".join(normalized.split())

    return normalized.strip()

def merge_event_info(event1: Event, event2: Event) -> Event:
    """
    Merge information from two duplicate events.
    Prefers longer/more detailed information.
    """
    return Event(
        id=event1.id,
        title=event1.title if len(event1.title) >= len(event2.title) else event2.title,
        description=event1.description if len(event1.description or "") >= len(event2.description or "") else event2.description,
        url=event1.url,  # Keep first source URL
        dateStart=event1.dateStart,
        dateEnd=event1.dateEnd or event2.dateEnd,
        submittedBy=event1.submittedBy,  # Keep first source
        submittedAt=event1.submittedAt,
        approved=True
    )
