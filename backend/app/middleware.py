"""Production middleware: request tracing, error handling, security headers, auth."""

import time
import uuid
import logging
import hmac
import hashlib
from datetime import datetime, timezone
from functools import wraps

from flask import request, g, jsonify, current_app

logger = logging.getLogger(__name__)


# ── Request ID Tracing ───────────────────────────────────────────────

def register_request_hooks(app):
    """Register before/after request hooks for tracing and logging."""

    @app.before_request
    def before_request():
        g.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        g.start_time = time.monotonic()
        logger.debug(
            "request_start",
            extra={
                "request_id": g.request_id,
                "method": request.method,
                "path": request.path,
                "remote_addr": request.remote_addr,
                "content_length": request.content_length,
            },
        )

    @app.after_request
    def after_request(response):
        duration_ms = (time.monotonic() - g.get("start_time", time.monotonic())) * 1000
        response.headers["X-Request-ID"] = g.get("request_id", "unknown")
        response.headers["X-Response-Time"] = f"{duration_ms:.1f}ms"

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "public, max-age=31536000"

        # HSTS in production
        if not current_app.debug:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        log_level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            log_level,
            "request_complete",
            extra={
                "request_id": g.get("request_id"),
                "method": request.method,
                "path": request.path,
                "status": response.status_code,
                "duration_ms": round(duration_ms, 1),
                "response_size": response.content_length,
            },
        )
        return response


# ── Global Error Handlers ────────────────────────────────────────────

def register_error_handlers(app):
    """Register JSON error handlers for all HTTP error codes."""

    @app.errorhandler(400)
    def bad_request(e):
        return jsonify({"error": "Bad request", "detail": str(e.description)}), 400

    @app.errorhandler(401)
    def unauthorized(e):
        return jsonify({"error": "Unauthorized", "detail": str(e.description)}), 401

    @app.errorhandler(403)
    def forbidden(e):
        return jsonify({"error": "Forbidden", "detail": str(e.description)}), 403

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(409)
    def conflict(e):
        return jsonify({"error": "Conflict", "detail": str(e.description)}), 409

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "Request too large", "detail": "File size exceeds limit"}), 413

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({"error": "Rate limit exceeded", "detail": str(e.description)}), 429

    @app.errorhandler(500)
    def internal_error(e):
        logger.exception("unhandled_error", extra={"request_id": g.get("request_id")})
        return jsonify({"error": "Internal server error"}), 500


# ── Auth Decorators ──────────────────────────────────────────────────

def require_admin(f):
    """Decorator requiring admin password in X-Admin-Password header.

    Includes Redis-backed brute-force protection: locks out an IP after
    5 failed attempts for 15 minutes.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        password = request.headers.get("X-Admin-Password", "")
        stored_hash = current_app.config.get("ADMIN_PASSWORD_HASH", "")

        if not stored_hash:
            # No admin password configured — allow only with explicit DISABLE_AUTH
            if current_app.config.get("DISABLE_AUTH"):
                return f(*args, **kwargs)
            return jsonify({"error": "Admin not configured"}), 503

        # Check brute-force lockout
        if _is_admin_locked_out():
            return jsonify({"error": "Too many failed attempts. Try again later."}), 429

        import bcrypt
        if not bcrypt.checkpw(password.encode(), stored_hash.encode()):
            _record_failed_admin_attempt()
            return jsonify({"error": "Invalid admin credentials"}), 401

        return f(*args, **kwargs)
    return decorated


def _is_admin_locked_out() -> bool:
    """Check if this IP is locked out from admin login attempts."""
    try:
        import redis
        r = redis.from_url(current_app.config.get("CELERY_BROKER_URL", "redis://localhost:6379/0"))
        key = f"admin_lockout:{request.remote_addr}"
        attempts = r.get(key)
        return attempts is not None and int(attempts) >= 5
    except Exception:
        return False


def _record_failed_admin_attempt():
    """Record a failed admin login attempt in Redis."""
    try:
        import redis
        r = redis.from_url(current_app.config.get("CELERY_BROKER_URL", "redis://localhost:6379/0"))
        key = f"admin_lockout:{request.remote_addr}"
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, 900)  # 15 minute lockout window
        pipe.execute()
    except Exception:
        pass


def require_event_access(f):
    """Decorator that validates event access via token or access_code.

    Expects either:
    - X-Event-Token header (JWT-like HMAC token)
    - access_code in query params or form data
    Sets g.event_id if valid.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        event_id = kwargs.get("event_id") or request.form.get("event_id")
        if not event_id:
            return jsonify({"error": "event_id is required"}), 400

        token = request.headers.get("X-Event-Token")
        if token and _verify_event_token(token, event_id):
            g.event_id = event_id
            return f(*args, **kwargs)

        # Fallback: check access code
        access_code = (
            request.args.get("access_code")
            or request.form.get("access_code")
        )
        if access_code:
            from .models import Event
            event = Event.query.get(event_id)
            if event and event.is_active and event.access_code == access_code:
                g.event_id = event_id
                return f(*args, **kwargs)

        # Allow unauthenticated access only with explicit opt-in (testing only)
        if current_app.config.get("DISABLE_AUTH"):
            g.event_id = event_id
            return f(*args, **kwargs)

        return jsonify({"error": "Invalid or missing event access"}), 403

    return decorated


def generate_event_token(event_id: str) -> str:
    """Generate an HMAC token for event access."""
    secret = current_app.config["JWT_SECRET"]
    expires = int((datetime.now(timezone.utc) + current_app.config["EVENT_TOKEN_EXPIRY"]).timestamp())
    payload = f"{event_id}:{expires}"
    signature = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:16]
    return f"{payload}:{signature}"


def _verify_event_token(token: str, event_id: str) -> bool:
    """Verify an HMAC event token."""
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
        token_event_id, expires_str, signature = parts
        if token_event_id != event_id:
            return False
        if int(expires_str) < int(datetime.now(timezone.utc).timestamp()):
            return False
        secret = current_app.config["JWT_SECRET"]
        expected = hmac.new(
            secret.encode(), f"{token_event_id}:{expires_str}".encode(), hashlib.sha256
        ).hexdigest()[:16]
        return hmac.compare_digest(signature, expected)
    except Exception:
        return False
