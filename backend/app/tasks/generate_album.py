"""Celery task for AI auto-album generation.

Orchestrates the full album pipeline:
1. Fetch all processed images for event
2. Cluster into moments by time/scene
3. Generate LLM captions per moment
4. Generate album title and summary
5. Persist Album + Moments + MomentPhotos
"""

import logging
from datetime import datetime, timezone

from .celery_app import celery

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=1, soft_time_limit=300, time_limit=360)
def generate_album_task(self, album_id: str, event_id: str):
    """Generate a complete album with clustered moments and LLM captions."""
    from .. import create_app
    from ..extensions import db
    from ..models.album import Album, Moment, MomentPhoto
    from ..services.album_service import cluster_event_photos
    from ..services.llm_service import generate_moment_caption, generate_album_title_and_summary

    app = create_app()
    with app.app_context():
        album = Album.query.get(album_id)
        if not album:
            return

        try:
            album.status = "generating"
            db.session.commit()

            # ── Step 1: Cluster photos into moments ───────────────────
            moment_clusters = cluster_event_photos(event_id)

            if not moment_clusters:
                album.status = "failed"
                album.error_message = "No processed photos found for this event"
                db.session.commit()
                return

            # ── Step 2: Generate captions and persist moments ─────────
            moment_summaries = []

            for cluster_data in moment_clusters:
                # Generate LLM caption for this moment
                caption_metadata = {
                    "dominant_scene": cluster_data["dominant_scene"],
                    "time_range": cluster_data["time_range"],
                    "photo_count": cluster_data["photo_count"],
                    "avg_faces": cluster_data["avg_faces"],
                    "lighting": cluster_data["lighting"],
                    "mood": cluster_data["mood"],
                }
                caption = generate_moment_caption(caption_metadata)
                moment_summaries.append(caption)

                # Create Moment record
                moment = Moment(
                    album_id=album.id,
                    caption=caption,
                    scene_type=cluster_data["dominant_scene"],
                    time_start=cluster_data["time_start"],
                    time_end=cluster_data["time_end"],
                    photo_count=cluster_data["photo_count"],
                    avg_faces=cluster_data["avg_faces"],
                    dominant_scene=cluster_data["dominant_scene"],
                    lighting=cluster_data["lighting"],
                    mood=cluster_data["mood"],
                    sort_order=cluster_data["sort_order"],
                )
                db.session.add(moment)
                db.session.flush()  # Get moment.id

                # Create MomentPhoto records
                for sort_idx, image in enumerate(cluster_data["photos"]):
                    mp = MomentPhoto(
                        moment_id=moment.id,
                        image_id=image.id,
                        sort_order=sort_idx,
                    )
                    db.session.add(mp)

            # ── Step 3: Generate album title and summary ──────────────
            album_meta = generate_album_title_and_summary(moment_summaries)
            album.title = album_meta.get("title", "Wedding Album")
            album.summary = album_meta.get("summary", "A collection of wedding memories.")

            album.status = "completed"
            album.completed_at = datetime.now(timezone.utc)
            db.session.commit()

            logger.info(
                "album_generation_complete",
                extra={
                    "album_id": album_id,
                    "event_id": event_id,
                    "moments": len(moment_clusters),
                    "title": album.title,
                },
            )

        except Exception as e:
            db.session.rollback()
            album = Album.query.get(album_id)
            if album:
                album.status = "failed"
                album.error_message = str(e)[:500]
                db.session.commit()

            logger.error(
                "album_generation_failed",
                extra={
                    "album_id": album_id,
                    "event_id": event_id,
                    "error": str(e),
                },
                exc_info=True,
            )
