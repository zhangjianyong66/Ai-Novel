from __future__ import annotations

from pydantic import Field, field_validator

from app.schemas.base import RequestModel


class ChapterGenerationInstructionPreferencesSave(RequestModel):
    instruction: str | None = Field(default=None, max_length=4000)

    @field_validator("instruction")
    @classmethod
    def _trim_instruction(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ChapterGenerationInstructionPreferencesOut(RequestModel):
    instructions: list[str] = Field(default_factory=list)
