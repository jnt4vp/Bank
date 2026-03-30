from functools import lru_cache
import json
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE = Path(__file__).parent.parent / ".env"

INSECURE_DEV_JWT_SECRET = "your-secret-key-change-in-production"


class Settings(BaseSettings):
    APP_ENV: Literal["development", "test", "production"] = "development"
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/bank"
    JWT_SECRET: str = INSECURE_DEV_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    SQL_ECHO: bool = False
    AUTO_CREATE_TABLES: bool = False

    CORS_ORIGINS: list[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

    OLLAMA_ENABLED: bool = True
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"

    # Gmail SMTP alert emails
    GMAIL_USER: str = ""
    GMAIL_APP_PASSWORD: str = ""
    ALERT_EMAIL: str = ""

    # Plaid
    PLAID_CLIENT_ID: str = ""
    PLAID_SECRET: str = ""
    PLAID_ENV: Literal["sandbox", "production"] = "sandbox"  # supported hosts in current Plaid SDK wiring
    PLAID_POLL_INTERVAL_MINUTES: int = 30
    PLAID_TOKEN_KEY: str = ""  # encryption key for access tokens; falls back to JWT_SECRET

    FRONTEND_URL: str = "http://localhost:5173"
    DEV_SEED_EXAMPLE_USER: bool = True
    DEV_SEED_EXAMPLE_NAME: str = "Test User"
    DEV_SEED_EXAMPLE_EMAIL: str = "test@example.com"
    DEV_SEED_EXAMPLE_PASSWORD: str = "Password123!"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
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
