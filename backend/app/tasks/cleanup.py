from datetime import datetime, timezone

from .celery_app import celery


@celery.task
def cleanup_expired_events():
    """Deactivate and clean up expired events. Run via Celery beat."""
    from .. import create_app
    from ..extensions import db
    from ..models import Event
    from ..services.storage_service import StorageService
    from ..services import vector_service

    app = create_app()
    with app.app_context():
        now = datetime.now(timezone.utc)
        expired = Event.query.filter(
            Event.expires_at.isnot(None),
            Event.expires_at < now,
            Event.is_active.is_(True),
        ).all()

        storage = StorageService(app.config["STORAGE_DIR"])

        from ..models.feedback import SearchFeedback, FaceReputationScore

        for event in expired:
            event.is_active = False
            vector_service.delete_collection(event.id)
            storage.delete_event_files(event.id)

            # Clean up feedback data for this event
            SearchFeedback.query.filter_by(event_id=event.id).delete()
            FaceReputationScore.query.filter_by(event_id=event.id).delete()

            app.logger.info(f"Cleaned up expired event: {event.id} ({event.name})")

        db.session.commit()
