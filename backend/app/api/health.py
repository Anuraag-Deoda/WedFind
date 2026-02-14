"""Health check endpoint with dependency status checks."""

import os
import time
import logging

from flask import Blueprint, jsonify, current_app

from ..extensions import db

logger = logging.getLogger(__name__)

health_bp = Blueprint("health", __name__)


@health_bp.route("/health", methods=["GET"])
def health_check():
    """Full health check with dependency status."""
    checks = {}
    overall_healthy = True

    # ── Database ──────────────────────────────────────────────────────
    try:
        start = time.monotonic()
        db.session.execute(db.text("SELECT 1"))
        db_ms = (time.monotonic() - start) * 1000
        checks["database"] = {"status": "healthy", "latency_ms": round(db_ms, 1)}
    except Exception as e:
        checks["database"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False

    # ── Redis (Celery broker) ─────────────────────────────────────────
    try:
        import redis
        broker_url = current_app.config.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
        r = redis.from_url(broker_url, socket_timeout=2)
        start = time.monotonic()
        r.ping()
        redis_ms = (time.monotonic() - start) * 1000
        checks["redis"] = {"status": "healthy", "latency_ms": round(redis_ms, 1)}
    except Exception as e:
        checks["redis"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False

    # ── ChromaDB ──────────────────────────────────────────────────────
    try:
        import chromadb
        chroma_dir = current_app.config.get("CHROMADB_DIR")
        start = time.monotonic()
        client = chromadb.PersistentClient(path=chroma_dir)
        client.heartbeat()
        chroma_ms = (time.monotonic() - start) * 1000
        collections = len(client.list_collections())
        checks["chromadb"] = {
            "status": "healthy",
            "latency_ms": round(chroma_ms, 1),
            "collections": collections,
        }
    except Exception as e:
        checks["chromadb"] = {"status": "unhealthy", "error": str(e)}
        overall_healthy = False

    # ── Disk space ────────────────────────────────────────────────────
    try:
        storage_dir = current_app.config.get("STORAGE_DIR", "/tmp")
        stat = os.statvfs(storage_dir)
        free_gb = (stat.f_bavail * stat.f_frsize) / (1024 ** 3)
        total_gb = (stat.f_blocks * stat.f_frsize) / (1024 ** 3)
        used_pct = round((1 - stat.f_bavail / stat.f_blocks) * 100, 1) if stat.f_blocks > 0 else 0

        disk_healthy = free_gb > 1.0  # warn if less than 1GB free
        checks["disk"] = {
            "status": "healthy" if disk_healthy else "warning",
            "free_gb": round(free_gb, 2),
            "total_gb": round(total_gb, 2),
            "used_percent": used_pct,
        }
        if not disk_healthy:
            overall_healthy = False
    except Exception as e:
        checks["disk"] = {"status": "unknown", "error": str(e)}

    # ── InsightFace model ─────────────────────────────────────────────
    try:
        from ..services.face_service import _model
        checks["insightface"] = {
            "status": "loaded" if _model is not None else "not_loaded",
            "model": current_app.config.get("INSIGHTFACE_MODEL", "buffalo_l"),
        }
    except Exception:
        checks["insightface"] = {"status": "unknown"}

    status_code = 200 if overall_healthy else 503
    return jsonify({
        "status": "healthy" if overall_healthy else "degraded",
        "service": "wedding-photo-finder",
        "version": "1.0.0",
        "checks": checks,
    }), status_code


@health_bp.route("/health/ready", methods=["GET"])
def readiness_check():
    """Lightweight readiness probe for load balancers."""
    try:
        db.session.execute(db.text("SELECT 1"))
        return jsonify({"ready": True}), 200
    except Exception:
        return jsonify({"ready": False}), 503


@health_bp.route("/health/live", methods=["GET"])
def liveness_check():
    """Lightweight liveness probe for container orchestration."""
    return jsonify({"alive": True}), 200
