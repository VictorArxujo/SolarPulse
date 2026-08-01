from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Religamento Remoto"

    database_url: str = "postgresql+psycopg://postgres:postgres@db:5432/religamento"

    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    modbus_timeout_seconds: float = 3.0


settings = Settings()
