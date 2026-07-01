from __future__ import annotations

from pydantic import Field, field_validator

from app.schemas.base import RequestModel


class OutlineGenerationPreferencesSave(RequestModel):
    tone: str | None = Field(default=None, max_length=255)
    pacing: str | None = Field(default=None, max_length=255)

    @field_validator("tone", "pacing")
    @classmethod
    def _strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class OutlineGenerationPreferencesOut(RequestModel):
    tone: list[str] = Field(default_factory=list)
    pacing: list[str] = Field(default_factory=list)
