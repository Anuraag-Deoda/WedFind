"""Structured logging configuration for production.

Supports JSON (for log aggregators) and text (for local dev) formats.
Injects request_id from Flask g context into every log line.
"""

import logging
import json
import sys
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Emit structured JSON log lines for log aggregation (ELK, CloudWatch, etc.)."""

    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        # Inject extra fields
        for key in ("request_id", "method", "path", "status", "duration_ms",
                     "remote_addr", "content_length", "response_size",
                     "event_id", "job_id", "image_id", "face_count"):
            if hasattr(record, key):
                log_entry[key] = getattr(record, key)

        if record.exc_info and record.exc_info[1]:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class TextFormatter(logging.Formatter):
    """Human-readable log format for local development."""

    def format(self, record):
        request_id = getattr(record, "request_id", "-")
        duration = getattr(record, "duration_ms", "")
        duration_str = f" [{duration}ms]" if duration else ""
        return (
            f"{datetime.now().strftime('%H:%M:%S')} "
            f"{record.levelname:<7} "
            f"[{request_id}] "
            f"{record.name}: {record.getMessage()}"
            f"{duration_str}"
        )


def configure_logging(app):
    """Set up logging based on app config."""
    log_level = getattr(logging, app.config.get("LOG_LEVEL", "INFO").upper(), logging.INFO)
    log_format = app.config.get("LOG_FORMAT", "json")

    # Clear existing handlers
    root = logging.getLogger()
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(log_level)

    if log_format == "json":
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(TextFormatter())

    root.addHandler(handler)
    root.setLevel(log_level)

    # Suppress noisy libraries
    for lib in ("urllib3", "chromadb", "httpx", "httpcore", "onnxruntime"):
        logging.getLogger(lib).setLevel(logging.WARNING)

    app.logger.info(
        "logging_configured",
        extra={"log_level": app.config["LOG_LEVEL"], "log_format": log_format},
    )
