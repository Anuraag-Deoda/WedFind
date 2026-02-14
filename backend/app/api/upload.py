"""Upload endpoint with file validation, deduplication, and rate limiting."""

import uuid
import logging

from flask import Blueprint, jsonify, request, current_app

from ..extensions import db, limiter
from ..models import Event, Image, ProcessingJob
from ..services.image_service import validate_image_file, compute_phash, phash_distance

logger = logging.getLogger(__name__)

upload_bp = Blueprint("upload", __name__)


@upload_bp.route("/upload", methods=["POST"])
@limiter.limit("120/minute")
def upload_images():
    event_id = request.form.get("event_id")
    if not event_id:
        return jsonify({"error": "event_id is required"}), 400

    event = Event.query.get(event_id)
    if not event or not event.is_active:
        return jsonify({"error": "Invalid or inactive event"}), 404

    consent = request.form.get("consent", "false").lower() == "true"
    if not consent:
        return jsonify({"error": "Consent is required to upload photos"}), 400

    files = request.files.getlist("images")
    if not files or len(files) == 0:
        return jsonify({"error": "No images provided"}), 400

    max_images = current_app.config.get("MAX_IMAGES_PER_UPLOAD", 50)
    if len(files) > max_images:
        return jsonify({"error": f"Maximum {max_images} images per upload"}), 400

    # Create processing job
    job = ProcessingJob(event_id=event_id, total_images=len(files))
    db.session.add(job)

    image_ids = []
    duplicates_skipped = 0
    invalid_files = 0

    from ..services.storage_service import StorageService
    storage = StorageService(current_app.config["STORAGE_DIR"])

    enable_dedup = current_app.config.get("ENABLE_DEDUPLICATION", True)
    phash_threshold = current_app.config.get("PHASH_DISTANCE_THRESHOLD", 8)

    for file in files:
        if not file.filename:
            invalid_files += 1
            job.failed_images += 1
            continue

        file_data = file.read()
        file_size = len(file_data)

        # ── File validation via magic bytes ───────────────────────────
        mime_type = validate_image_file(file_data)
        if not mime_type:
            logger.info(
                "upload_rejected_invalid_file",
                extra={"filename": file.filename, "event_id": event_id},
            )
            invalid_files += 1
            job.failed_images += 1
            continue

        # ── Size check ────────────────────────────────────────────────
        max_size = current_app.config.get("MAX_CONTENT_LENGTH", 50 * 1024 * 1024)
        if file_size > max_size:
            invalid_files += 1
            job.failed_images += 1
            continue

        # ── Perceptual hash deduplication ─────────────────────────────
        phash = compute_phash(file_data)
        duplicate_of = None
        is_duplicate = False

        if enable_dedup and phash:
            existing = (
                Image.query
                .filter_by(event_id=event_id, is_duplicate=False)
                .filter(Image.phash.isnot(None))
                .all()
            )
            for existing_img in existing:
                dist = phash_distance(phash, existing_img.phash)
                if dist <= phash_threshold:
                    is_duplicate = True
                    duplicate_of = existing_img.id
                    logger.info(
                        "upload_duplicate_detected",
                        extra={
                            "phash_distance": dist,
                            "original_id": existing_img.id,
                            "event_id": event_id,
                        },
                    )
                    break

        if is_duplicate:
            duplicates_skipped += 1
            # Still save but mark as duplicate — don't process faces
            ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else "jpg"
            stored_filename = f"{uuid.uuid4()}.{ext}"
            storage.save_original(event_id, stored_filename, file_data)

            image = Image(
                event_id=event_id,
                original_filename=file.filename,
                stored_filename=stored_filename,
                mime_type=mime_type,
                file_size=file_size,
                phash=phash,
                is_duplicate=True,
                duplicate_of=duplicate_of,
                is_processed=True,  # Skip processing
            )
            db.session.add(image)
            continue

        # ── Save original ─────────────────────────────────────────────
        ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else "jpg"
        stored_filename = f"{uuid.uuid4()}.{ext}"
        storage.save_original(event_id, stored_filename, file_data)

        image_id = str(uuid.uuid4())
        image = Image(
            id=image_id,
            event_id=event_id,
            original_filename=file.filename,
            stored_filename=stored_filename,
            mime_type=mime_type,
            file_size=file_size,
            phash=phash,
        )
        db.session.add(image)
        image_ids.append(image_id)

    db.session.commit()

    # Queue processing task for non-duplicate images
    if image_ids:
        try:
            from ..tasks.process_image import process_upload_batch
            process_upload_batch.delay(job.id, image_ids)
        except Exception as e:
            logger.warning(
                "celery_unavailable",
                extra={"job_id": job.id, "error": str(e)},
            )

    logger.info(
        "upload_complete",
        extra={
            "event_id": event_id,
            "job_id": job.id,
            "accepted": len(image_ids),
            "duplicates": duplicates_skipped,
            "invalid": invalid_files,
        },
    )

    return jsonify({
        "job_id": job.id,
        "images_accepted": len(image_ids),
        "images_rejected": invalid_files,
        "duplicates_skipped": duplicates_skipped,
    }), 202
