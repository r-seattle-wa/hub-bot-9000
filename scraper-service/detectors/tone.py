"""Tone classification using Gemini AI."""
import os
import json
import logging
from dataclasses import dataclass
from typing import Optional, Literal

logger = logging.getLogger(__name__)

ToneType = Literal['polite', 'neutral', 'frustrated', 'hostile', 'dramatic']
ClassificationType = Literal['friendly', 'neutral', 'adversarial', 'hateful']


@dataclass
class ToneResult:
    tone: ToneType
    confidence: float
    classification: ClassificationType  # For crosslink classification
    trigger_phrase: Optional[str] = None


# Keyword-based fallback when Gemini is not available
HOSTILE_KEYWORDS = [
    'hate', 'awful', 'terrible', 'worst', 'garbage', 'trash',
    'stupid', 'idiots', 'morons', 'losers', 'pathetic',
    'fuck', 'shit', 'damn', 'hell', 'ass',
]

FRUSTRATED_KEYWORDS = [
    'annoying', 'frustrated', 'tired of', 'sick of', 'fed up',
    'ridiculous', 'absurd', 'unbelievable', 'seriously',
]

DRAMATIC_KEYWORDS = [
    'never', 'always', 'everyone', 'nobody', 'completely',
    'absolutely', 'literally', 'worst ever', 'best ever',
    '!!!', '???', 'omg', 'wtf',
]

POLITE_KEYWORDS = [
    'please', 'thank you', 'appreciate', 'kind', 'helpful',
    'great', 'wonderful', 'love', 'enjoy', 'welcome',
]


def classify_tone_fallback(text: str) -> ToneResult:
    """Keyword-based tone classification fallback."""
    lower_text = text.lower()

    # Count keyword matches
    hostile_count = sum(1 for kw in HOSTILE_KEYWORDS if kw in lower_text)
    frustrated_count = sum(1 for kw in FRUSTRATED_KEYWORDS if kw in lower_text)
    dramatic_count = sum(1 for kw in DRAMATIC_KEYWORDS if kw in lower_text)
    polite_count = sum(1 for kw in POLITE_KEYWORDS if kw in lower_text)

    # Determine tone based on keyword counts
    if hostile_count >= 2:
        return ToneResult(
            tone='hostile',
            confidence=min(0.5 + hostile_count * 0.1, 0.8),
            classification='adversarial',
        )
    elif frustrated_count >= 2:
        return ToneResult(
            tone='frustrated',
            confidence=min(0.5 + frustrated_count * 0.1, 0.8),
            classification='adversarial',
        )
    elif dramatic_count >= 2:
        return ToneResult(
            tone='dramatic',
            confidence=min(0.5 + dramatic_count * 0.1, 0.8),
            classification='neutral',
        )
    elif polite_count >= 2:
        return ToneResult(
            tone='polite',
            confidence=min(0.5 + polite_count * 0.1, 0.8),
            classification='friendly',
        )
    else:
        return ToneResult(
            tone='neutral',
            confidence=0.6,
            classification='neutral',
        )


async def classify_tone(text: str, api_key: Optional[str] = None) -> ToneResult:
    """
    Classify the tone of text using Gemini AI.
    Falls back to keyword matching if API key not available.
    """
    if not api_key:
        api_key = os.getenv('GOOGLE_API_KEY')

    if not api_key:
        return classify_tone_fallback(text)

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.0-flash')

        prompt = f"""Analyze the tone of this text and classify it.

Text: "{text[:500]}"

Return ONLY valid JSON (no markdown):
{{
  "tone": "polite" | "neutral" | "frustrated" | "hostile" | "dramatic",
  "confidence": 0.0-1.0,
  "classification": "friendly" | "neutral" | "adversarial" | "hateful",
  "trigger_phrase": "optional phrase that indicates the tone"
}}

Definitions:
- polite: Kind, appreciative, welcoming
- neutral: Matter-of-fact, no strong emotion
- frustrated: Annoyed but not aggressive
- hostile: Aggressive, attacking, insulting
- dramatic: Over-the-top emotional, exaggerated

- friendly: Positive engagement
- neutral: Neither positive nor negative
- adversarial: Critical, negative, attacking the community
- hateful: Contains slurs, threats, or extreme hostility"""

        response = model.generate_content(
            prompt,
            generation_config={'temperature': 0.1, 'max_output_tokens': 256},
        )

        text_response = response.text.strip()
        # Clean markdown if present
        if text_response.startswith('```'):
            text_response = text_response.split('```')[1]
            if text_response.startswith('json'):
                text_response = text_response[4:]
        text_response = text_response.strip()

        result = json.loads(text_response)
        return ToneResult(
            tone=result.get('tone', 'neutral'),
            confidence=result.get('confidence', 0.7),
            classification=result.get('classification', 'neutral'),
            trigger_phrase=result.get('trigger_phrase'),
        )

    except Exception as e:
        logger.warning(f"Gemini tone classification failed: {e}, using fallback")
        return classify_tone_fallback(text)
