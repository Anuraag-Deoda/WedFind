import os
import secrets
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    """Base configuration — all values overridable via environment."""

    # ── Core ─────────────────────────────────────────────────────────
    SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_hex(32))
    DEBUG = False
    TESTING = False

    # ── Database ─────────────────────────────────────────────────────
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'app.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    # ── Storage ──────────────────────────────────────────────────────
    STORAGE_DIR = os.environ.get("STORAGE_DIR", str(BASE_DIR / "storage"))
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", 100 * 1024 * 1024))
    MAX_IMAGES_PER_UPLOAD = int(os.environ.get("MAX_IMAGES_PER_UPLOAD", 50))
    ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "heic", "heif"}
    ALLOWED_MIME_TYPES = {
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    }

    # ── Celery ───────────────────────────────────────────────────────
    CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
    CELERY_TASK_SOFT_TIME_LIMIT = int(os.environ.get("CELERY_TASK_SOFT_TIME_LIMIT", 300))
    CELERY_TASK_TIME_LIMIT = int(os.environ.get("CELERY_TASK_TIME_LIMIT", 600))

    # ── ChromaDB ─────────────────────────────────────────────────────
    CHROMADB_DIR = os.environ.get("CHROMADB_DIR", str(BASE_DIR / "chromadb_data"))

    # ── Face search ──────────────────────────────────────────────────
    FACE_SIMILARITY_THRESHOLD = float(os.environ.get("FACE_SIMILARITY_THRESHOLD", "0.70"))
    MAX_SEARCH_RESULTS = int(os.environ.get("MAX_SEARCH_RESULTS", 100))
    INSIGHTFACE_MODEL = os.environ.get("INSIGHTFACE_MODEL", "buffalo_l")
    INSIGHTFACE_DET_SIZE = int(os.environ.get("INSIGHTFACE_DET_SIZE", 640))

    # ── Auth ─────────────────────────────────────────────────────────
    ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")
    EVENT_TOKEN_EXPIRY = timedelta(
        hours=int(os.environ.get("EVENT_TOKEN_EXPIRY_HOURS", 24))
    )
    JWT_SECRET = os.environ.get("JWT_SECRET", SECRET_KEY)

    # ── Rate limiting ────────────────────────────────────────────────
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_DEFAULT = os.environ.get("RATELIMIT_DEFAULT", "200/minute")
    RATELIMIT_HEADERS_ENABLED = True

    # ── Logging ──────────────────────────────────────────────────────
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
    LOG_FORMAT = os.environ.get("LOG_FORMAT", "json")  # json or text

    # ── CORS ─────────────────────────────────────────────────────────
    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",")

    # ── Image processing ─────────────────────────────────────────────
    PROCESSED_MAX_SIZE = int(os.environ.get("PROCESSED_MAX_SIZE", 2048))
    THUMBNAIL_SIZE = int(os.environ.get("THUMBNAIL_SIZE", 400))
    JPEG_QUALITY = int(os.environ.get("JPEG_QUALITY", 85))
    THUMBNAIL_QUALITY = int(os.environ.get("THUMBNAIL_QUALITY", 80))
    ENABLE_WEBP_THUMBNAILS = os.environ.get("ENABLE_WEBP_THUMBNAILS", "true").lower() == "true"
    ENABLE_DEDUPLICATION = os.environ.get("ENABLE_DEDUPLICATION", "true").lower() == "true"
    PHASH_DISTANCE_THRESHOLD = int(os.environ.get("PHASH_DISTANCE_THRESHOLD", 8))
    MAX_PIXELS = int(os.environ.get("MAX_PIXELS", 50_000_000))

    # ── Face detection thresholds ──────────────────────────────────
    MIN_FACE_DETECTION_SCORE = float(os.environ.get("MIN_FACE_DETECTION_SCORE", "0.5"))
    MIN_FACE_SIZE_PX = int(os.environ.get("MIN_FACE_SIZE_PX", "30"))

    # ── Embedding versioning ───────────────────────────────────────
    EMBEDDING_MODEL_VERSION = os.environ.get(
        "EMBEDDING_MODEL_VERSION",
        f"{os.environ.get('INSIGHTFACE_MODEL', 'buffalo_l')}_v1",
    )

    # ── Auth bypass (explicit opt-in only) ─────────────────────────
    DISABLE_AUTH = False

    # ── OpenAI (smart search + album generation) ───────────────────
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
    OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    ENABLE_SMART_SEARCH = os.environ.get("ENABLE_SMART_SEARCH", "true").lower() == "true"


class DevelopmentConfig(Config):
    DEBUG = True
    LOG_LEVEL = "DEBUG"
    RATELIMIT_STORAGE_URI = "memory://"
    DISABLE_AUTH = os.environ.get("DISABLE_AUTH", "false").lower() == "true"


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
        "pool_size": 10,
        "max_overflow": 20,
    }


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    CELERY_TASK_ALWAYS_EAGER = True
    ENABLE_DEDUPLICATION = False
    DISABLE_AUTH = True


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "test": TestConfig,
}
