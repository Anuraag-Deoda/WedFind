"""Flask application factory with full production middleware stack."""

import os
import logging

from flask import Flask

from .config import config_by_name
from .extensions import db, cors, limiter
from .logging_config import configure_logging
from .middleware import register_request_hooks, register_error_handlers

logger = logging.getLogger(__name__)


def create_app(config_name=None):
    if config_name is None:
        config_name = os.environ.get("FLASK_ENV", "development")

    app = Flask(__name__)
    app.config.from_object(config_by_name[config_name])

    # ── Logging ──────────────────────────────────────────────────────
    configure_logging(app)

    # ── Extensions ───────────────────────────────────────────────────
    db.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config.get("CORS_ORIGINS", ["*"])}},
        expose_headers=["X-Request-ID", "X-Response-Time"],
    )
    limiter.init_app(app)

    # ── Middleware ────────────────────────────────────────────────────
    register_request_hooks(app)
    register_error_handlers(app)

    # ── Storage directories ──────────────────────────────────────────
    storage_dir = app.config["STORAGE_DIR"]
    for subdir in ["originals", "processed", "thumbnails", "selfies"]:
        os.makedirs(os.path.join(storage_dir, subdir), exist_ok=True)

    # Ensure data dir exists for SQLite
    data_dir = os.path.dirname(
        app.config["SQLALCHEMY_DATABASE_URI"].replace("sqlite:///", "")
    )
    if data_dir:
        os.makedirs(data_dir, exist_ok=True)

    # ── Blueprints ───────────────────────────────────────────────────
    from .api.health import health_bp
    from .api.events import events_bp
    from .api.upload import upload_bp
    from .api.search import search_bp
    from .api.jobs import jobs_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(events_bp, url_prefix="/api")
    app.register_blueprint(upload_bp, url_prefix="/api")
    app.register_blueprint(search_bp, url_prefix="/api")
    app.register_blueprint(jobs_bp, url_prefix="/api")

    # ── Database tables ──────────────────────────────────────────────
    with app.app_context():
        from . import models  # noqa: F401
        try:
            db.create_all()
        except Exception:
            pass

    # ── Preload InsightFace model ────────────────────────────────────
    try:
        from .services.face_service import get_model
        get_model()
        logger.info("insightface_model_loaded")
    except Exception as e:
        logger.warning("insightface_preload_failed", extra={"error": str(e)})

    logger.info(
        "app_ready",
        extra={
            "config": config_name,
            "storage_dir": storage_dir,
            "chromadb_dir": app.config["CHROMADB_DIR"],
        },
    )

    return app
