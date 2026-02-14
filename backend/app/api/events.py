import os
import secrets
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, send_from_directory, current_app

from ..extensions import db
from ..models import Event

events_bp = Blueprint("events", __name__)


@events_bp.route("/events", methods=["GET"])
def list_events():
    events = Event.query.order_by(Event.created_at.desc()).all()
    return jsonify([e.to_dict() for e in events])


@events_bp.route("/events", methods=["POST"])
def create_event():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Event name is required"}), 400

    access_code = data.get("access_code") or secrets.token_hex(4).upper()

    existing = Event.query.filter_by(access_code=access_code).first()
    if existing:
        return jsonify({"error": "Access code already in use"}), 409

    event = Event(
        name=data["name"],
        access_code=access_code,
    )

    if data.get("expires_at"):
        event.expires_at = datetime.fromisoformat(data["expires_at"])

    db.session.add(event)
    db.session.commit()

    return jsonify(event.to_dict()), 201


@events_bp.route("/events/<event_id>", methods=["GET"])
def get_event(event_id):
    event = Event.query.get_or_404(event_id)
    return jsonify(event.to_dict())


@events_bp.route("/events/<event_id>", methods=["DELETE"])
def delete_event(event_id):
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return jsonify({"message": "Event deleted"}), 200


@events_bp.route("/events/<event_id>/verify", methods=["POST"])
def verify_event(event_id):
    data = request.get_json()
    if not data or not data.get("access_code"):
        return jsonify({"error": "Access code is required"}), 400

    event = Event.query.get_or_404(event_id)

    if not event.is_active:
        return jsonify({"error": "Event is no longer active"}), 403

    if event.expires_at and event.expires_at < datetime.now(timezone.utc):
        return jsonify({"error": "Event has expired"}), 403

    if event.access_code != data["access_code"]:
        return jsonify({"error": "Invalid access code"}), 403

    return jsonify({"verified": True, "event": event.to_dict()})


@events_bp.route("/events/<event_id>/stats", methods=["GET"])
def event_stats(event_id):
    event = Event.query.get_or_404(event_id)
    image_count = event.images.count()
    face_count = sum(img.face_count for img in event.images.all())
    processed_count = event.images.filter_by(is_processed=True).count()
    total_size = sum(img.file_size for img in event.images.all())

    return jsonify(
        {
            "event_id": event.id,
            "event_name": event.name,
            "image_count": image_count,
            "face_count": face_count,
            "processed_count": processed_count,
            "storage_used_bytes": total_size,
        }
    )


@events_bp.route("/events/<event_id>/images", methods=["GET"])
def list_images(event_id):
    Event.query.get_or_404(event_id)

    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 50, type=int)
    per_page = min(per_page, 100)

    from ..models import Image

    pagination = (
        Image.query.filter_by(event_id=event_id)
        .order_by(Image.uploaded_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    return jsonify(
        {
            "images": [img.to_dict() for img in pagination.items],
            "total": pagination.total,
            "page": pagination.page,
            "pages": pagination.pages,
            "has_next": pagination.has_next,
        }
    )


@events_bp.route("/events/lookup", methods=["POST"])
def lookup_event():
    data = request.get_json()
    if not data or not data.get("access_code"):
        return jsonify({"error": "Access code is required"}), 400

    event = Event.query.filter_by(access_code=data["access_code"]).first()
    if not event:
        return jsonify({"error": "Event not found"}), 404

    if not event.is_active:
        return jsonify({"error": "Event is no longer active"}), 403

    if event.expires_at and event.expires_at < datetime.now(timezone.utc):
        return jsonify({"error": "Event has expired"}), 403

    return jsonify({"event_id": event.id, "event_name": event.name})


@events_bp.route("/events/<event_id>/file/<filename>", methods=["GET"])
def serve_image(event_id, filename):
    storage_dir = current_app.config["STORAGE_DIR"]
    directory = os.path.join(storage_dir, "processed", event_id)
    return send_from_directory(directory, filename)


@events_bp.route("/events/<event_id>/thumbnail/<filename>", methods=["GET"])
def serve_thumbnail(event_id, filename):
    storage_dir = current_app.config["STORAGE_DIR"]
    directory = os.path.join(storage_dir, "thumbnails", event_id)
    return send_from_directory(directory, filename)
