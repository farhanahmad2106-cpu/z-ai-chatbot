from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

IndicLocale = Literal[
    "hi-IN",
    "ta-IN",
    "te-IN",
    "bn-IN",
    "mr-IN",
    "en-IN",
]

class TTSRequest(BaseModel):
    model_config = ConfigDict(strict=True)

    text: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Text to synthesize into speech",
    )

    language_code: IndicLocale = Field(
        default="hi-IN"
    )

    speaker: str = Field(
        default="shubh",
        min_length=1,
        max_length=64,
        description="Sarvam-supported speaker",
    )

class STTResponse(BaseModel):
    model_config = ConfigDict(strict=True)

    transcript: str
    language_code: IndicLocale
    confidence_score: Optional[float] = None
    duration_seconds: float
