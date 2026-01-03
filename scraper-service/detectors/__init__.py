# Content detectors for unified analysis
from .haiku import detect_haiku, HaikuResult
from .farewell import detect_farewell, detect_political_complaint, FarewellResult, PoliticalComplaintResult
from .crosslink import detect_crosslinks, CrosslinkResult
from .tone import classify_tone, ToneResult

__all__ = [
    'detect_haiku', 'HaikuResult',
    'detect_farewell', 'detect_political_complaint', 'FarewellResult', 'PoliticalComplaintResult',
    'detect_crosslinks', 'CrosslinkResult',
    'classify_tone', 'ToneResult',
]
