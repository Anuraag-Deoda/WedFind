"""Feedback service for adaptive search reranking.

Handles persisting "Not Me" feedback, computing hard negative penalties,
tracking face reputation scores, and providing feedback statistics.
"""

import hashlib
import logging

import numpy as np

from ..extensions import db
from ..models.feedback import SearchFeedback, FaceReputationScore
from ..services import vector_service

logger = logging.getLogger(__name__)


def compute_selfie_hash(embedding: list[float]) -> str:
    """SHA-256 hash of a face embedding to group feedback by searcher.

    Two searches with the same selfie produce the same hash, linking their
    feedback history without storing the actual embedding.
    """
    raw = np.array(embedding, dtype=np.float32).tobytes()
    return hashlib.sha256(raw).hexdigest()


def record_feedback(
    event_id: str,
    image_id: str,
    selfie_hash: str,
    rejected_embedding_id: str,
    rejected_face_id: str | None = None,
) -> SearchFeedback:
    """Persist a 'Not Me' click and update the face's reputation score.

    Args:
        event_id: Event identifier
        image_id: The image that was rejected
        selfie_hash: Hash of the searcher's selfie embedding
        rejected_embedding_id: ChromaDB embedding ID of the rejected face
        rejected_face_id: SQLite face ID (optional)

    Returns:
        The created SearchFeedback record
    """
    # Check for duplicate feedback (same searcher rejecting same embedding)
    existing = SearchFeedback.query.filter_by(
        event_id=event_id,
        selfie_hash=selfie_hash,
        rejected_embedding_id=rejected_embedding_id,
    ).first()

    if existing:
        logger.debug(
            "duplicate_feedback_skipped",
            extra={
                "event_id": event_id,
                "embedding_id": rejected_embedding_id,
            },
        )
        return existing

    feedback = SearchFeedback(
        event_id=event_id,
        image_id=image_id,
        selfie_hash=selfie_hash,
        rejected_embedding_id=rejected_embedding_id,
        rejected_face_id=rejected_face_id,
    )
    db.session.add(feedback)

    # Update face reputation score
    reputation = FaceReputationScore.query.filter_by(
        embedding_id=rejected_embedding_id,
    ).first()

    if not reputation:
        reputation = FaceReputationScore(
            event_id=event_id,
            embedding_id=rejected_embedding_id,
            times_shown=1,
            times_rejected=1,
        )
        db.session.add(reputation)
    else:
        reputation.times_rejected += 1

    reputation.update_stats()
    db.session.commit()

    logger.info(
        "feedback_recorded",
        extra={
            "event_id": event_id,
            "image_id": image_id,
            "embedding_id": rejected_embedding_id,
            "rejection_rate": reputation.rejection_rate,
            "score_penalty": reputation.score_penalty,
        },
    )

    return feedback


def increment_shown(event_id: str, embedding_ids: list[str]):
    """Increment times_shown for a batch of embeddings that appeared in results.

    Called after search results are computed so reputation tracking stays accurate.
    """
    if not embedding_ids:
        return

    for eid in embedding_ids:
        reputation = FaceReputationScore.query.filter_by(
            embedding_id=eid,
        ).first()

        if not reputation:
            reputation = FaceReputationScore(
                event_id=event_id,
                embedding_id=eid,
                times_shown=1,
                times_rejected=0,
            )
            db.session.add(reputation)
        else:
            reputation.times_shown += 1

        reputation.update_stats()

    db.session.commit()


def get_hard_negatives(event_id: str, selfie_hash: str) -> list[np.ndarray]:
    """Retrieve rejected face embeddings from ChromaDB for this searcher.

    Returns a list of numpy arrays (512-dim each) for cosine penalty computation.
    """
    feedbacks = SearchFeedback.query.filter_by(
        event_id=event_id,
        selfie_hash=selfie_hash,
    ).all()

    if not feedbacks:
        return []

    embedding_ids = list({f.rejected_embedding_id for f in feedbacks})
    embeddings = vector_service.get_embeddings_by_ids(event_id, embedding_ids)

    return [np.array(emb, dtype=np.float32) for emb in embeddings if emb is not None]


def get_global_hard_negatives(event_id: str) -> list[np.ndarray]:
    """Get embeddings of globally confusing faces (rejected by many users).

    Returns embeddings with rejection_rate > 0.3 and at least 3 impressions.
    """
    confusers = FaceReputationScore.query.filter(
        FaceReputationScore.event_id == event_id,
        FaceReputationScore.rejection_rate > 0.3,
        FaceReputationScore.times_shown >= 3,
    ).all()

    if not confusers:
        return []

    embedding_ids = [c.embedding_id for c in confusers]
    embeddings = vector_service.get_embeddings_by_ids(event_id, embedding_ids)

    return [np.array(emb, dtype=np.float32) for emb in embeddings if emb is not None]


def compute_hard_negative_penalty(
    candidate_emb: np.ndarray,
    hard_negatives: list[np.ndarray],
    strength: float = 0.15,
) -> float:
    """Compute penalty for a candidate based on similarity to known negatives.

    Uses vectorized cosine similarity. Penalty activates when similarity > 0.6
    and scales linearly up to `strength`.

    Args:
        candidate_emb: 512-dim embedding of the candidate face
        hard_negatives: List of 512-dim embeddings of rejected faces
        strength: Maximum penalty magnitude

    Returns:
        Negative float (penalty) or 0.0 if no similarity above threshold
    """
    if not hard_negatives:
        return 0.0

    # Stack negatives into matrix for vectorized computation
    neg_matrix = np.stack(hard_negatives)  # (N, 512)

    # Normalize for cosine similarity
    cand_norm = candidate_emb / (np.linalg.norm(candidate_emb) + 1e-8)
    neg_norms = neg_matrix / (np.linalg.norm(neg_matrix, axis=1, keepdims=True) + 1e-8)

    # Cosine similarities
    similarities = neg_norms @ cand_norm  # (N,)

    # Penalty activates above 0.6 threshold, scales linearly to strength
    threshold = 0.6
    penalties = np.where(
        similarities > threshold,
        -strength * (similarities - threshold) / (1.0 - threshold),
        0.0,
    )

    # Return the strongest (most negative) penalty
    return float(np.min(penalties)) if np.any(penalties < 0) else 0.0


def get_reputation_penalties(
    event_id: str, embedding_ids: list[str]
) -> dict[str, float]:
    """Batch lookup of pre-computed reputation penalties.

    Returns a dict mapping embedding_id -> penalty (negative float or 0.0).
    """
    if not embedding_ids:
        return {}

    reputations = FaceReputationScore.query.filter(
        FaceReputationScore.event_id == event_id,
        FaceReputationScore.embedding_id.in_(embedding_ids),
    ).all()

    return {r.embedding_id: r.score_penalty for r in reputations}


def get_feedback_stats(event_id: str, selfie_hash: str) -> dict:
    """Get feedback statistics for frontend display.

    Returns count of feedbacks from this searcher and total unique rejected faces.
    """
    personal_count = SearchFeedback.query.filter_by(
        event_id=event_id,
        selfie_hash=selfie_hash,
    ).count()

    total_count = SearchFeedback.query.filter_by(
        event_id=event_id,
    ).count()

    return {
        "personal_feedback_count": personal_count,
        "total_feedback_count": total_count,
    }
