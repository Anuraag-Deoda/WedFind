"""Async image processing task with full production pipeline.

For each uploaded image:
1. Validate and process (resize, EXIF strip, progressive JPEG, WebP thumbnail)
2. Store EXIF metadata (camera, timestamp) extracted before stripping
3. Extract image-level metadata (brightness, sharpness, colors, scene)
4. Detect faces and extract embeddings
5. For each face: extract rich attributes (age, gender, pose, quality, prominence)
6. Build combined metadata document for BM25 indexing
7. Store embedding + metadata in ChromaDB, face records in SQLite
"""

import uuid
import logging
from datetime import datetime, timezone

import numpy as np

from .celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=2, soft_time_limit=120, time_limit=180)
def process_upload_batch(self, job_id: str, image_ids: list[str]):
    """Process a batch of uploaded images with full metadata extraction."""
    from .. import create_app
    from ..extensions import db
    from ..models import Image, Face, ProcessingJob
    from ..services.storage_service import StorageService
    from ..services.image_service import process_image, load_image_for_detection
    from ..services import face_service, vector_service
    from ..services.metadata_service import (
        extract_image_metadata,
        extract_face_metadata,
        build_chromadb_metadata,
    )

    app = create_app()
    with app.app_context():
        job = ProcessingJob.query.get(job_id)
        if not job:
            return

        job.status = "processing"
        db.session.commit()

        storage = StorageService(app.config["STORAGE_DIR"])
        image_config = {
            "processed_max_size": app.config.get("PROCESSED_MAX_SIZE", 2048),
            "thumbnail_size": app.config.get("THUMBNAIL_SIZE", 400),
            "jpeg_quality": app.config.get("JPEG_QUALITY", 85),
            "thumbnail_quality": app.config.get("THUMBNAIL_QUALITY", 80),
            "enable_webp_thumbnails": app.config.get("ENABLE_WEBP_THUMBNAILS", True),
        }

        min_det_score = app.config.get("MIN_FACE_DETECTION_SCORE", 0.5)
        min_face_size = app.config.get("MIN_FACE_SIZE_PX", 30)

        for image_id in image_ids:
            original_data = None
            image_np = None
            try:
                # Use savepoint so partial Face records roll back on error
                with db.session.begin_nested():
                    image = Image.query.get(image_id)
                    if not image:
                        job.failed_images += 1
                        continue

                    # ── Step 1: Read original ────────────────────────────
                    original_path = storage.get_original_path(
                        image.event_id, image.stored_filename
                    )
                    with open(original_path, "rb") as f:
                        original_data = f.read()

                    # ── Step 2: Process image ────────────────────────────
                    result = process_image(original_data, config=image_config)

                    # Determine thumbnail extension
                    thumb_ext = "webp" if result["thumbnail_format"] == "webp" else "jpg"
                    processed_name = f"{image.id}.jpg"
                    thumb_name = f"{image.id}_thumb.{thumb_ext}"

                    storage.save_processed(image.event_id, processed_name, result["processed"])
                    storage.save_thumbnail(image.event_id, thumb_name, result["thumbnail"])

                    image.stored_filename = processed_name
                    image.thumbnail_filename = thumb_name
                    image.width = result["width"]
                    image.height = result["height"]

                    # ── Step 3: Store EXIF metadata ──────────────────────
                    exif = result.get("exif", {})
                    image.camera_make = exif.get("camera_make")
                    image.camera_model = exif.get("camera_model")
                    image.taken_at = exif.get("taken_at")
                    image.orientation = exif.get("orientation")

                    # ── Step 4: Extract image-level metadata ─────────────
                    # Reuse processed image instead of re-reading from disk
                    import io
                    from PIL import Image as PILImage
                    processed_img = PILImage.open(io.BytesIO(result["processed"]))
                    if processed_img.mode != "RGB":
                        processed_img = processed_img.convert("RGB")
                    image_np = np.array(processed_img)
                    del processed_img  # free PIL image

                    image_meta = extract_image_metadata(image_np)

                    image.brightness = image_meta["brightness"]
                    image.contrast = image_meta["contrast"]
                    image.sharpness = image_meta["sharpness"]
                    image.dominant_colors = image_meta["dominant_colors"]
                    image.scene_type = image_meta["scene_type"]
                    image.metadata_text = image_meta["metadata_text"]

                    # ── Step 5: Detect faces ─────────────────────────────
                    faces = face_service.detect_faces(image_np)

                    # Filter out low-quality detections
                    quality_faces = [
                        f for f in faces
                        if f["score"] >= min_det_score
                        and f["bbox"]["w"] >= min_face_size
                        and f["bbox"]["h"] >= min_face_size
                    ]
                    image.face_count = len(quality_faces)

                    # ── Step 6: Process each face ────────────────────────
                    for face_data in quality_faces:
                        embedding_id = str(uuid.uuid4())

                        # Extract rich face metadata
                        face_meta = extract_face_metadata(
                            face_data["raw_face"], image_np
                        )

                        # Build ChromaDB metadata (flat dict)
                        chroma_meta = build_chromadb_metadata(
                            face_meta=face_meta,
                            image_meta=image_meta,
                            image_id=image.id,
                        )

                        # Create Face record in SQLite
                        face = Face(
                            image_id=image.id,
                            embedding_id=embedding_id,
                            bbox_x=face_data["bbox"]["x"],
                            bbox_y=face_data["bbox"]["y"],
                            bbox_w=face_data["bbox"]["w"],
                            bbox_h=face_data["bbox"]["h"],
                            detection_score=face_data["score"],
                            age=face_meta.get("age"),
                            gender=face_meta.get("gender"),
                            face_quality=face_meta.get("face_quality"),
                            yaw=face_meta.get("yaw"),
                            pitch=face_meta.get("pitch"),
                            roll=face_meta.get("roll"),
                            prominence=face_meta.get("prominence"),
                            center_dist=face_meta.get("center_dist"),
                            is_frontal=face_meta.get("is_frontal"),
                            metadata_text=face_meta.get("metadata_text"),
                        )
                        db.session.add(face)

                        # Store in ChromaDB with rich metadata
                        vector_service.add_embedding(
                            event_id=image.event_id,
                            embedding_id=embedding_id,
                            embedding=face_data["embedding"],
                            metadata=chroma_meta,
                        )

                        job.total_faces_found += 1

                    image.is_processed = True
                    job.processed_images += 1

                db.session.commit()

                logger.info(
                    "image_processed",
                    extra={
                        "image_id": image_id,
                        "job_id": job_id,
                        "faces_detected": len(faces),
                        "faces_stored": len(quality_faces),
                        "width": result["width"],
                        "height": result["height"],
                        "thumb_format": result["thumbnail_format"],
                    },
                )

            except Exception as e:
                db.session.rollback()
                job.failed_images += 1
                db.session.commit()
                logger.error(
                    "image_processing_failed",
                    extra={"image_id": image_id, "job_id": job_id, "error": str(e)},
                    exc_info=True,
                )
            finally:
                # Explicitly free large objects to prevent memory buildup
                del original_data
                del image_np

        # Mark job complete
        job.status = "completed"
        job.completed_at = datetime.now(timezone.utc)
        if job.failed_images > 0 and job.processed_images == 0:
            job.status = "failed"
            job.error_message = "All images failed to process"
        db.session.commit()

        logger.info(
            "job_complete",
            extra={
                "job_id": job_id,
                "status": job.status,
                "processed": job.processed_images,
                "failed": job.failed_images,
                "faces": job.total_faces_found,
            },
        )
