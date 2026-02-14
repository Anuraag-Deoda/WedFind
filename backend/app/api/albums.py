"""Album API endpoints for AI auto-album generation."""

import logging

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Event

logger = logging.getLogger(__name__)

albums_bp = Blueprint("albums", __name__)


@albums_bp.route("/events/<event_id>/albums/generate", methods=["POST"])
def generate_album(event_id):
    """Trigger async album generation for an event."""
    event = Event.query.get_or_404(event_id)

    from ..models.album import Album

    # Check for existing in-progress album generation
    existing = Album.query.filter_by(
        event_id=event_id, status="generating"
    ).first()
    if existing:
        return jsonify({
            "message": "Album generation already in progress",
            "album_id": existing.id,
            "status": existing.status,
        }), 409

    # Create album record
    album = Album(event_id=event_id, status="pending")
    db.session.add(album)
    db.session.commit()

    # Dispatch Celery task
    try:
        from ..tasks.generate_album import generate_album_task
        generate_album_task.delay(album.id, event_id)
        album.status = "generating"
        db.session.commit()
    except Exception as e:
        logger.error(
            "album_generation_dispatch_failed",
            extra={"event_id": event_id, "error": str(e)},
        )
        album.status = "failed"
        album.error_message = "Processing queue unavailable. Please retry."
        db.session.commit()
        return jsonify({
            "error": "Album generation service temporarily unavailable",
            "album_id": album.id,
        }), 503

    logger.info(
        "album_generation_started",
        extra={"event_id": event_id, "album_id": album.id},
    )

    return jsonify({
        "album_id": album.id,
        "status": "generating",
        "message": "Album generation started",
    }), 202


@albums_bp.route("/events/<event_id>/albums", methods=["GET"])
def list_albums(event_id):
    """List all albums for an event."""
    Event.query.get_or_404(event_id)

    from ..models.album import Album

    albums = (
        Album.query
        .filter_by(event_id=event_id)
        .order_by(Album.created_at.desc())
        .all()
    )

    return jsonify({
        "albums": [a.to_dict() for a in albums],
        "count": len(albums),
    })


@albums_bp.route("/events/<event_id>/albums/<album_id>", methods=["GET"])
def get_album(event_id, album_id):
    """Get a specific album with all moments and photos."""
    Event.query.get_or_404(event_id)

    from ..models.album import Album

    album = Album.query.filter_by(id=album_id, event_id=event_id).first_or_404()

    return jsonify(album.to_dict(include_moments=True))


@albums_bp.route("/events/<event_id>/albums/<album_id>", methods=["DELETE"])
def delete_album(event_id, album_id):
    """Delete a specific album."""
    Event.query.get_or_404(event_id)

    from ..models.album import Album

    album = Album.query.filter_by(id=album_id, event_id=event_id).first_or_404()

    db.session.delete(album)
    db.session.commit()

    return jsonify({"message": "Album deleted"}), 200
