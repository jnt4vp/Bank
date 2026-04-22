from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GoalAttributionSpec(BaseModel):
    """User goal with optional detectable signals (not name-only)."""

    category: str = Field(..., min_length=1, max_length=120)
    keywords: list[str] = Field(
        default_factory=list,
        max_length=1,
        description="At most one extra hint for rule/AI matching; Ollama handles broader categorization.",
    )
    merchants: list[str] = Field(default_factory=list, max_length=40)
    subcategories: list[str] = Field(
        default_factory=list,
        max_length=40,
        description="Broad themes (e.g. entertainment, shopping). Used to map AI broad labels.",
    )

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        s = value.strip()
        if not s:
            raise ValueError("category must not be empty")
        return s

    @field_validator("keywords", mode="before")
    @classmethod
    def clean_keywords(cls, value: object) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for item in value:
            s = str(item).strip()
            if s and len(s) <= 80:
                out.append(s)
                break
        return out[:1]

    @field_validator("merchants", "subcategories", mode="before")
    @classmethod
    def clean_string_lists(cls, value: object) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            return []
        out: list[str] = []
        for item in value:
            s = str(item).strip()
            if s and len(s) <= 80:
                out.append(s)
        return out[:40]


class GoalSpendingRequest(BaseModel):
    goals: list[GoalAttributionSpec] = Field(default_factory=list, max_length=50)
    goal_categories: list[str] | None = Field(
        default=None,
        description="Deprecated: use goals[].category only.",
    )
    period_start: date
    period_end: date

    @model_validator(mode="after")
    def merge_legacy_goal_categories(self):
        if not self.goals and self.goal_categories:
            self.goals = [
                GoalAttributionSpec(category=str(c).strip())
                for c in self.goal_categories
                if str(c).strip()
            ]
        return self


class GoalSpendingResponse(BaseModel):
    spent_by_goal: dict[str, float]
    method: str
    llm_assigned_count: int = 0


class GoalCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=120)
    monthly_limit: float = Field(..., gt=0, le=1_000_000)

    @field_validator("category")
    @classmethod
    def strip_category(cls, value: str) -> str:
        s = value.strip()
        if not s:
            raise ValueError("category must not be empty")
        return s


class GoalResponse(BaseModel):
    id: UUID
    category: str
    monthly_limit: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
