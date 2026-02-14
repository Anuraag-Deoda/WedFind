"""Face detection and embedding extraction using InsightFace buffalo_l.

Returns both processed face data (embeddings, bbox) and raw InsightFace
face objects for rich metadata extraction.
"""

import numpy as np

_model = None


def get_model():
    """Get or initialize the InsightFace model (singleton per process)."""
    global _model
    if _model is None:
        from insightface.app import FaceAnalysis

        _model = FaceAnalysis(
            name="buffalo_l",
            providers=["CPUExecutionProvider"],
        )
        _model.prepare(ctx_id=0, det_size=(640, 640))
    return _model


def detect_faces(image_np: np.ndarray) -> list[dict]:
    """Detect faces in an image and extract embeddings + raw face objects.

    Args:
        image_np: RGB image as numpy array (H, W, 3)

    Returns:
        List of dicts with keys:
        - embedding: normalized 512-dim list
        - bbox: {x, y, w, h}
        - score: detection confidence
        - raw_face: the original InsightFace face object (for metadata extraction)
    """
    model = get_model()
    faces = model.get(image_np)

    results = []
    for face in faces:
        embedding = face.embedding
        # Normalize embedding to unit vector for cosine similarity
        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        bbox = face.bbox.tolist()  # [x1, y1, x2, y2]
        results.append(
            {
                "embedding": embedding.tolist(),
                "bbox": {
                    "x": bbox[0],
                    "y": bbox[1],
                    "w": bbox[2] - bbox[0],
                    "h": bbox[3] - bbox[1],
                },
                "score": float(face.det_score),
                "raw_face": face,  # keep raw for metadata_service
            }
        )

    return results


def detect_single_face(image_np: np.ndarray) -> dict:
    """Detect exactly one face in a selfie image. Raises ValueError if not exactly one.

    Returns the same dict format as detect_faces but for a single face,
    plus additional metadata from the raw face object for query enrichment.
    """
    faces = detect_faces(image_np)

    if len(faces) == 0:
        raise ValueError(
            "No face detected in the selfie. Please upload a clear photo of your face."
        )

    if len(faces) > 1:
        raise ValueError(
            "Multiple faces detected. Please upload a photo with only your face."
        )

    return faces[0]
