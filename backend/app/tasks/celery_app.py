from celery import Celery
from celery.signals import worker_process_init


def make_celery(app=None):
    celery = Celery(
        "wedding_photo_finder",
        broker="redis://localhost:6379/0",
        backend="redis://localhost:6379/0",
    )

    if app:
        celery.conf.update(
            broker_url=app.config["CELERY_BROKER_URL"],
            result_backend=app.config["CELERY_RESULT_BACKEND"],
        )

        class ContextTask(celery.Task):
            def __call__(self, *args, **kwargs):
                with app.app_context():
                    return self.run(*args, **kwargs)

        celery.Task = ContextTask

    celery.conf.update(
        task_serializer="json",
        accept_content=["json"],
        result_serializer="json",
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        worker_prefetch_multiplier=1,
        task_acks_late=True,
        include=["app.tasks.process_image"],
    )

    return celery


# Create module-level celery instance for worker
celery = make_celery()


@worker_process_init.connect
def preload_models(**kwargs):
    """Pre-load InsightFace model when Celery worker starts."""
    try:
        from ..services.face_service import get_model

        get_model()
        print("InsightFace model loaded successfully")
    except Exception as e:
        print(f"Warning: Could not preload InsightFace model: {e}")
