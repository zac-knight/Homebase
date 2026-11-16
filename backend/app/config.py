import secrets
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="HOMEBASE_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./homebase.db"
    # Leave empty to generate a random secret per process (tokens then die on restart).
    jwt_secret: str = ""
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    google_client_id: str = ""
    # Enables POST /auth/dev (email-only sign in). Never turn on in production.
    dev_auth: bool = False
    # auto | hashing | sentence-transformers
    embedder: str = "auto"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    cors_origin_regex: str = r"^(chrome-extension://[a-p]{32}|http://(localhost|127\.0\.0\.1):\d+)$"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    if not s.jwt_secret:
        s.jwt_secret = secrets.token_urlsafe(48)
    return s
