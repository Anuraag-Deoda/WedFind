"""Advanced metadata extraction for images and faces.

Extracts rich, multi-dimensional metadata to power hybrid RAG retrieval:
- Image-level: brightness, contrast, sharpness, dominant colors, scene classification
- Face-level: age, gender, quality, pose, prominence, frontality
- Generates textual descriptions for BM25 indexing
"""

import json
import math

import numpy as np
from PIL import Image


def extract_image_metadata(image_np: np.ndarray) -> dict:
    """Extract image-level quality and scene metadata from a numpy RGB array.

    Returns dict with: brightness, contrast, sharpness, dominant_colors, scene_type,
    metadata_text.
    """
    h, w = image_np.shape[:2]

    # Convert to grayscale for luminance analysis
    gray = np.mean(image_np, axis=2)

    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))

    # Sharpness via Laplacian variance (higher = sharper)
    # Approximate Laplacian with simple kernel convolution
    sharpness = _laplacian_variance(gray)

    # Dominant colors via k-means on downsampled pixels
    dominant_colors = _extract_dominant_colors(image_np, k=3)

    # Scene classification from brightness/contrast heuristics
    scene_type = _classify_scene(brightness, contrast, image_np)

    # Build textual description for BM25
    color_names = [_hex_to_name(c) for c in dominant_colors]
    metadata_text = _build_image_text(
        brightness=brightness,
        contrast=contrast,
        sharpness=sharpness,
        scene_type=scene_type,
        colors=color_names,
        width=w,
        height=h,
    )

    return {
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "sharpness": round(sharpness, 2),
        "dominant_colors": json.dumps(dominant_colors),
        "scene_type": scene_type,
        "metadata_text": metadata_text,
    }


def extract_face_metadata(
    face_obj, image_np: np.ndarray
) -> dict:
    """Extract rich metadata from an InsightFace detection result.

    Args:
        face_obj: InsightFace Face object with attributes
        image_np: The source image as numpy array (H, W, 3)

    Returns dict with: age, gender, face_quality, yaw, pitch, roll,
    prominence, center_dist, is_frontal, metadata_text.
    """
    h, w = image_np.shape[:2]
    image_area = h * w

    bbox = face_obj.bbox.tolist()  # [x1, y1, x2, y2]
    face_w = bbox[2] - bbox[0]
    face_h = bbox[3] - bbox[1]
    face_area = face_w * face_h
    prominence = face_area / image_area if image_area > 0 else 0

    # Face center position relative to image center
    face_cx = (bbox[0] + bbox[2]) / 2
    face_cy = (bbox[1] + bbox[3]) / 2
    img_cx, img_cy = w / 2, h / 2
    # Normalize distance: 0 = dead center, 1 = corner
    max_dist = math.sqrt(img_cx**2 + img_cy**2)
    center_dist = math.sqrt((face_cx - img_cx)**2 + (face_cy - img_cy)**2) / max_dist if max_dist > 0 else 0

    # Age and gender from InsightFace
    age = int(face_obj.age) if hasattr(face_obj, "age") and face_obj.age is not None else None
    gender_raw = face_obj.gender if hasattr(face_obj, "gender") and face_obj.gender is not None else None
    gender = "M" if gender_raw == 1 else "F" if gender_raw == 0 else None

    # Pose estimation (yaw, pitch, roll) - InsightFace provides pose as 3D array
    yaw, pitch, roll = None, None, None
    if hasattr(face_obj, "pose") and face_obj.pose is not None:
        pose = face_obj.pose.tolist() if hasattr(face_obj.pose, "tolist") else list(face_obj.pose)
        if len(pose) >= 3:
            yaw, pitch, roll = float(pose[0]), float(pose[1]), float(pose[2])

    # Frontality: face is roughly facing camera
    is_frontal = (
        abs(yaw or 0) < 15 and abs(pitch or 0) < 15
    )

    # Face quality score: composite of detection confidence, size, frontality, sharpness
    det_score = float(face_obj.det_score) if hasattr(face_obj, "det_score") else 0.5
    face_quality = _compute_face_quality(
        det_score=det_score,
        prominence=prominence,
        is_frontal=is_frontal,
        face_region=_crop_face(image_np, bbox),
    )

    # Build textual description for BM25
    metadata_text = _build_face_text(
        age=age,
        gender=gender,
        is_frontal=is_frontal,
        prominence=prominence,
        center_dist=center_dist,
        face_quality=face_quality,
        yaw=yaw,
    )

    return {
        "age": age,
        "gender": gender,
        "face_quality": round(face_quality, 4),
        "yaw": round(yaw, 2) if yaw is not None else None,
        "pitch": round(pitch, 2) if pitch is not None else None,
        "roll": round(roll, 2) if roll is not None else None,
        "prominence": round(prominence, 6),
        "center_dist": round(center_dist, 4),
        "is_frontal": is_frontal,
        "metadata_text": metadata_text,
    }


def build_chromadb_metadata(face_meta: dict, image_meta: dict, image_id: str) -> dict:
    """Build the flat metadata dict stored alongside each embedding in ChromaDB.

    ChromaDB metadata supports string, int, float, bool — no nested objects.
    This rich metadata enables filtered queries and re-ranking.
    """
    meta = {"image_id": image_id}

    # Face attributes (filterable)
    if face_meta.get("age") is not None:
        meta["age"] = face_meta["age"]
        meta["age_bracket"] = _age_bracket(face_meta["age"])
    if face_meta.get("gender"):
        meta["gender"] = face_meta["gender"]
    if face_meta.get("face_quality") is not None:
        meta["face_quality"] = face_meta["face_quality"]
    if face_meta.get("is_frontal") is not None:
        meta["is_frontal"] = face_meta["is_frontal"]
    if face_meta.get("prominence") is not None:
        meta["prominence"] = face_meta["prominence"]
    if face_meta.get("center_dist") is not None:
        meta["center_dist"] = face_meta["center_dist"]
    if face_meta.get("yaw") is not None:
        meta["abs_yaw"] = abs(face_meta["yaw"])

    # Image attributes (filterable)
    if image_meta.get("brightness") is not None:
        meta["brightness"] = image_meta["brightness"]
    if image_meta.get("sharpness") is not None:
        meta["sharpness"] = image_meta["sharpness"]
    if image_meta.get("scene_type"):
        meta["scene_type"] = image_meta["scene_type"]

    # Combined text for document-level BM25
    texts = []
    if face_meta.get("metadata_text"):
        texts.append(face_meta["metadata_text"])
    if image_meta.get("metadata_text"):
        texts.append(image_meta["metadata_text"])
    meta["doc_text"] = " ".join(texts)

    return meta


# ─── Private helpers ──────────────────────────────────────────────────


def _laplacian_variance(gray: np.ndarray) -> float:
    """Compute sharpness via Laplacian variance on grayscale image."""
    # Downsample for speed on large images
    if gray.shape[0] > 1000 or gray.shape[1] > 1000:
        factor = max(gray.shape[0], gray.shape[1]) / 1000
        new_h = int(gray.shape[0] / factor)
        new_w = int(gray.shape[1] / factor)
        # Simple block averaging
        gray = np.array(
            Image.fromarray(gray.astype(np.uint8)).resize((new_w, new_h))
        ).astype(float)

    # 3x3 Laplacian kernel
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=float)
    from scipy.signal import convolve2d
    lap = convolve2d(gray, kernel, mode="valid")
    return float(np.var(lap))


def _extract_dominant_colors(image_np: np.ndarray, k: int = 3) -> list[str]:
    """Extract dominant colors using mini-batch k-means on downsampled pixels."""
    from sklearn.cluster import MiniBatchKMeans

    # Downsample to max 100x100 for speed
    img = Image.fromarray(image_np)
    img.thumbnail((100, 100))
    pixels = np.array(img).reshape(-1, 3).astype(float)

    if len(pixels) < k:
        return ["#000000"]

    kmeans = MiniBatchKMeans(n_clusters=k, n_init=1, random_state=42)
    kmeans.fit(pixels)
    centers = kmeans.cluster_centers_.astype(int)
    # Sort by cluster size (most dominant first)
    labels, counts = np.unique(kmeans.labels_, return_counts=True)
    order = np.argsort(-counts)

    return [
        f"#{centers[labels[i]][0]:02x}{centers[labels[i]][1]:02x}{centers[labels[i]][2]:02x}"
        for i in order
    ]


def _classify_scene(brightness: float, contrast: float, image_np: np.ndarray) -> str:
    """Heuristic scene classification from image statistics."""
    h, w = image_np.shape[:2]

    # Check warm tones (wedding receptions often warm-lit)
    r_mean = float(np.mean(image_np[:, :, 0]))
    b_mean = float(np.mean(image_np[:, :, 2]))
    warm_ratio = r_mean / (b_mean + 1e-6)

    if brightness < 50:
        return "night"
    elif brightness < 90:
        if warm_ratio > 1.3:
            return "indoor_warm"  # reception, candlelight
        return "indoor_dim"
    elif brightness > 180:
        return "outdoor_bright"
    elif warm_ratio > 1.2:
        return "indoor_warm"
    elif contrast > 60:
        return "outdoor"
    else:
        return "indoor"


def _hex_to_name(hex_color: str) -> str:
    """Convert hex color to approximate human-readable name."""
    r, g, b = int(hex_color[1:3], 16), int(hex_color[3:5], 16), int(hex_color[5:7], 16)
    brightness = (r + g + b) / 3

    if brightness > 220:
        return "white"
    elif brightness < 35:
        return "black"
    elif r > 180 and g < 100 and b < 100:
        return "red"
    elif r > 180 and g > 140 and b < 100:
        return "gold"
    elif g > 150 and r < 100 and b < 100:
        return "green"
    elif b > 150 and r < 100 and g < 100:
        return "blue"
    elif r > 150 and g < 100 and b > 100:
        return "pink"
    elif brightness > 170:
        return "light"
    elif brightness > 100:
        return "neutral"
    else:
        return "dark"


def _crop_face(image_np: np.ndarray, bbox: list) -> np.ndarray:
    """Crop face region from image, clipped to bounds."""
    h, w = image_np.shape[:2]
    x1 = max(0, int(bbox[0]))
    y1 = max(0, int(bbox[1]))
    x2 = min(w, int(bbox[2]))
    y2 = min(h, int(bbox[3]))
    return image_np[y1:y2, x1:x2]


def _compute_face_quality(
    det_score: float,
    prominence: float,
    is_frontal: bool,
    face_region: np.ndarray,
) -> float:
    """Composite face quality score (0-1) from multiple signals.

    Weights:
    - Detection confidence: 30%
    - Face sharpness (not blurry): 25%
    - Prominence (face size): 25%
    - Frontality: 20%
    """
    # Sharpness of the face crop
    if face_region.size > 0:
        gray = np.mean(face_region, axis=2)
        face_sharpness = min(1.0, _laplacian_variance(gray) / 500)
    else:
        face_sharpness = 0.0

    # Prominence score: sigmoid-like mapping, optimal around 5-30% of image
    prom_score = min(1.0, prominence * 10)  # 10% of image → 1.0

    frontal_score = 1.0 if is_frontal else 0.4

    quality = (
        0.30 * det_score
        + 0.25 * face_sharpness
        + 0.25 * prom_score
        + 0.20 * frontal_score
    )
    return max(0.0, min(1.0, quality))


def _age_bracket(age: int) -> str:
    """Map age to bracket for filterable metadata."""
    if age < 13:
        return "child"
    elif age < 20:
        return "teen"
    elif age < 35:
        return "young_adult"
    elif age < 55:
        return "adult"
    else:
        return "senior"


def _build_image_text(
    brightness: float,
    contrast: float,
    sharpness: float,
    scene_type: str,
    colors: list[str],
    width: int,
    height: int,
) -> str:
    """Build a textual description of the image for BM25 indexing."""
    parts = []

    parts.append(f"scene:{scene_type}")

    if brightness > 180:
        parts.append("bright well-lit")
    elif brightness < 80:
        parts.append("dark low-light")

    if sharpness > 200:
        parts.append("sharp crisp")
    elif sharpness < 30:
        parts.append("soft blurry")

    if contrast > 60:
        parts.append("high-contrast")

    parts.append(f"colors:{','.join(colors)}")

    orientation = "landscape" if width > height else "portrait" if height > width else "square"
    parts.append(orientation)

    return " ".join(parts)


def _build_face_text(
    age: int | None,
    gender: str | None,
    is_frontal: bool,
    prominence: float,
    center_dist: float,
    face_quality: float,
    yaw: float | None,
) -> str:
    """Build a textual description of a face for BM25 indexing."""
    parts = []

    if gender:
        parts.append(f"gender:{gender.lower()}")
    if age is not None:
        parts.append(f"age:{age}")
        parts.append(f"bracket:{_age_bracket(age)}")

    if is_frontal:
        parts.append("frontal facing-camera")
    else:
        if yaw is not None:
            if abs(yaw) > 45:
                parts.append("profile side-view")
            else:
                parts.append("angled partial-profile")

    if prominence > 0.05:
        parts.append("close-up prominent large-face")
    elif prominence > 0.01:
        parts.append("medium-shot")
    else:
        parts.append("background small-face group")

    if center_dist < 0.2:
        parts.append("centered")
    elif center_dist > 0.6:
        parts.append("edge peripheral")

    if face_quality > 0.7:
        parts.append("high-quality clear")
    elif face_quality < 0.3:
        parts.append("low-quality unclear")

    return " ".join(parts)
