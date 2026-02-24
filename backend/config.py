from functools import lru_cache
import json
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


INSECURE_DEV_JWT_SECRET = "your-secret-key-change-in-production"


class Settings(BaseSettings):
    APP_ENV: Literal["development", "test", "production"] = "development"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/bank"
    JWT_SECRET: str = INSECURE_DEV_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    SQL_ECHO: bool = False
    AUTO_CREATE_TABLES: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if not isinstance(value, str):
            return value

        raw = value.strip()
        if not raw:
            return []

        if raw.startswith("["):
            return json.loads(raw)

        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @model_validator(mode="after")
    def validate_security(self) -> "Settings":
        if not self.JWT_SECRET.strip():
            raise ValueError("JWT_SECRET must not be empty")

        if self.APP_ENV == "production" and self.JWT_SECRET == INSECURE_DEV_JWT_SECRET:
            raise ValueError("JWT_SECRET must be overridden in production")

        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
