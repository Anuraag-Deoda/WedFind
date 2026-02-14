"""Album clustering service for grouping wedding photos into moments.

Clusters event photos by:
1. Time-based: Groups photos by EXIF timestamp with adaptive gap detection
2. Scene-based: Within time clusters, sub-groups by scene_type and lighting
3. Metadata enrichment: Computes per-moment statistics for LLM caption generation
"""

import logging
from datetime import timedelta
from collections import Counter

from ..models import Image

logger = logging.getLogger(__name__)

# Gap between photos that triggers a new moment cluster (minutes)
DEFAULT_TIME_GAP_MINUTES = 15
# Minimum photos per moment (smaller clusters get merged with neighbors)
MIN_MOMENT_SIZE = 3
# Maximum photos per moment (split large clusters by scene)
MAX_MOMENT_SIZE = 50


def cluster_event_photos(event_id: str) -> list[dict]:
    """Cluster all processed photos in an event into moments.

    Returns list of moment dicts, each with:
        - photos: list of Image objects
        - time_start, time_end: datetime range
        - dominant_scene: most common scene_type
        - avg_faces: average face_count
        - photo_count: int
        - lighting: inferred from scene types
        - mood: inferred from face count and scene
    """
    images = (
        Image.query
        .filter_by(event_id=event_id, is_processed=True, is_duplicate=False)
        .order_by(Image.taken_at.asc().nullslast(), Image.uploaded_at.asc())
        .all()
    )

    if not images:
        return []

    # ── Step 1: Time-based clustering ─────────────────────────────────
    time_clusters = _cluster_by_time(images)

    # ── Step 2: Split large clusters by scene ─────────────────────────
    refined_clusters = []
    for cluster in time_clusters:
        if len(cluster) > MAX_MOMENT_SIZE:
            refined_clusters.extend(_split_by_scene(cluster))
        else:
            refined_clusters.append(cluster)

    # ── Step 3: Merge tiny clusters with neighbors ────────────────────
    merged = _merge_small_clusters(refined_clusters)

    # ── Step 4: Enrich each cluster with metadata ─────────────────────
    moments = []
    for i, cluster in enumerate(merged):
        moment = _build_moment_metadata(cluster, sort_order=i)
        moments.append(moment)

    logger.info(
        "clustering_complete",
        extra={
            "event_id": event_id,
            "total_photos": len(images),
            "moments": len(moments),
        },
    )
    return moments


def _cluster_by_time(images: list[Image]) -> list[list[Image]]:
    """Group images by timestamp proximity."""
    if not images:
        return []

    # Separate images with and without timestamps
    with_time = [img for img in images if img.taken_at is not None]
    without_time = [img for img in images if img.taken_at is None]

    clusters = []

    if with_time:
        current_cluster = [with_time[0]]
        for img in with_time[1:]:
            gap = img.taken_at - current_cluster[-1].taken_at
            if gap > timedelta(minutes=DEFAULT_TIME_GAP_MINUTES):
                clusters.append(current_cluster)
                current_cluster = [img]
            else:
                current_cluster.append(img)
        clusters.append(current_cluster)

    # Images without timestamps go into their own cluster
    if without_time:
        clusters.append(without_time)

    return clusters


def _split_by_scene(cluster: list[Image]) -> list[list[Image]]:
    """Split a large cluster into sub-clusters by scene_type."""
    by_scene: dict[str, list[Image]] = {}
    for img in cluster:
        scene = img.scene_type or "unknown"
        by_scene.setdefault(scene, []).append(img)

    sub_clusters = list(by_scene.values())

    # If splitting didn't help (all same scene), chunk by size
    result = []
    for sub in sub_clusters:
        if len(sub) > MAX_MOMENT_SIZE:
            for i in range(0, len(sub), MAX_MOMENT_SIZE):
                result.append(sub[i : i + MAX_MOMENT_SIZE])
        else:
            result.append(sub)

    return result


def _merge_small_clusters(
    clusters: list[list[Image]],
) -> list[list[Image]]:
    """Merge clusters smaller than MIN_MOMENT_SIZE with their nearest neighbor."""
    if len(clusters) <= 1:
        return clusters

    merged = []
    i = 0
    while i < len(clusters):
        cluster = clusters[i]
        if len(cluster) < MIN_MOMENT_SIZE and merged:
            # Merge with previous cluster
            merged[-1].extend(cluster)
        elif len(cluster) < MIN_MOMENT_SIZE and i + 1 < len(clusters):
            # Merge with next cluster
            clusters[i + 1] = cluster + clusters[i + 1]
        else:
            merged.append(cluster)
        i += 1

    return merged


def _build_moment_metadata(photos: list[Image], sort_order: int) -> dict:
    """Compute metadata summary for a cluster of photos."""
    # Time range
    timestamps = [p.taken_at for p in photos if p.taken_at]
    time_start = min(timestamps) if timestamps else None
    time_end = max(timestamps) if timestamps else None

    # Dominant scene
    scene_counts = Counter(p.scene_type for p in photos if p.scene_type)
    dominant_scene = scene_counts.most_common(1)[0][0] if scene_counts else "unknown"

    # Average faces
    face_counts = [p.face_count or 0 for p in photos]
    avg_faces = sum(face_counts) / len(face_counts) if face_counts else 0

    # Lighting inference from scene types
    lighting = _infer_lighting(photos)

    # Mood inference
    mood = _infer_mood(avg_faces, dominant_scene, photos)

    # Build time range string for LLM
    time_range = "unknown"
    if time_start and time_end:
        time_range = f"{time_start.strftime('%I:%M %p')} - {time_end.strftime('%I:%M %p')}"
    elif time_start:
        time_range = time_start.strftime("%I:%M %p")

    return {
        "photos": photos,
        "photo_count": len(photos),
        "time_start": time_start,
        "time_end": time_end,
        "time_range": time_range,
        "dominant_scene": dominant_scene,
        "avg_faces": round(avg_faces, 1),
        "lighting": lighting,
        "mood": mood,
        "sort_order": sort_order,
    }


def _infer_lighting(photos: list[Image]) -> str:
    """Infer lighting conditions from scene types and brightness."""
    scene_types = [p.scene_type or "" for p in photos]
    brightness_vals = [p.brightness for p in photos if p.brightness is not None]
    avg_brightness = sum(brightness_vals) / len(brightness_vals) if brightness_vals else 128

    night_count = sum(1 for s in scene_types if "night" in s)
    indoor_count = sum(1 for s in scene_types if "indoor" in s)
    outdoor_count = sum(1 for s in scene_types if "outdoor" in s)

    if night_count > len(photos) * 0.5:
        return "night"
    elif outdoor_count > indoor_count and avg_brightness > 150:
        return "daylight"
    elif any("warm" in s for s in scene_types):
        return "warm_indoor"
    elif indoor_count > outdoor_count:
        return "indoor"
    elif avg_brightness > 160:
        return "bright"
    else:
        return "mixed"


def _infer_mood(avg_faces: float, dominant_scene: str, photos: list[Image]) -> str:
    """Infer the mood of a moment from metadata signals."""
    if avg_faces > 5:
        return "celebratory"
    elif avg_faces > 2:
        return "joyful"
    elif dominant_scene in ("night", "indoor_dim"):
        return "intimate"
    elif dominant_scene in ("outdoor_bright", "outdoor"):
        return "vibrant"
    elif avg_faces <= 1:
        return "contemplative"
    else:
        return "joyful"
