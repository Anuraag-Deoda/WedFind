"""Hybrid RAG search pipeline for face matching.

Four-stage retrieval:
  Stage 1 — Broad vector recall: Query ChromaDB with a lower threshold to
            maximize recall. Returns top-N candidates with cosine similarity.
            Optionally pre-filters by gender when selfie metadata is available.

  Stage 2 — BM25 re-scoring: Build a BM25 index from textual metadata
            descriptions of all faces in the event. Score each candidate
            against a query document built from the selfie's face attributes.
            This captures semantic signals the embedding can't (age bracket,
            scene type, frontality). BM25 index is cached per event.

  Stage 3 — Reciprocal Rank Fusion + quality boosting: Fuse vector and BM25
            rankings using RRF with additive scoring. Quality signals (face
            quality, prominence, sharpness) contribute a bounded adjustment.

  Stage 4 — Adaptive reranking: Apply penalties from "Not Me" feedback.
            Personal hard negatives (this searcher's history), global confusers
            (faces rejected by many users), and per-face reputation scores
            adjust the composite score downward for likely false positives.

This approach handles:
- Similar-looking people (metadata differentiates)
- Poor quality matches (quality-boosted ranking pushes them down)
- Profile/blurry shots (metadata signals reduce their rank)
- Repeated false positives (feedback-driven penalties suppress them)
"""

import logging
import threading

import numpy as np
from rank_bm25 import BM25Okapi

from ..services import face_service, vector_service
from ..services.image_service import load_image_for_detection
from ..services.metadata_service import extract_face_metadata
from ..services import feedback_service
from ..models import Face, Image

logger = logging.getLogger(__name__)

# ── BM25 Index Cache ─────────────────────────────────────────────────
# Caches BM25 index per event to avoid rebuilding on every search.
# Keyed by event_id → (doc_count, bm25_index, id_list).
# Invalidated when doc_count changes (new faces added).
_bm25_cache: dict[str, tuple[int, BM25Okapi, list[str]]] = {}
_bm25_lock = threading.Lock()


def invalidate_bm25_cache(event_id: str):
    """Call this when new embeddings are added to an event."""
    with _bm25_lock:
        _bm25_cache.pop(event_id, None)


class SearchService:

    # Reciprocal Rank Fusion constant (standard: 60)
    RRF_K = 60

    # Weight balance: how much vector vs BM25 matters in fusion
    VECTOR_WEIGHT = 0.70
    BM25_WEIGHT = 0.30

    # Stage 4 penalty weights
    PERSONAL_NEG_STRENGTH = 0.15
    GLOBAL_NEG_STRENGTH = 0.08

    # Minimum results from filtered query before falling back to unfiltered
    MIN_FILTERED_RESULTS = 5

    def search(
        self,
        event_id: str,
        selfie_path: str,
        threshold: float = 0.70,
        max_results: int = 100,
        excluded_image_ids: list[str] | None = None,
        metadata_filters: dict | None = None,
        extra_query_text: str | None = None,
    ) -> dict:
        """Multi-stage hybrid search for photos containing the selfie person.

        Args:
            event_id: Event to search within
            selfie_path: Path to selfie image
            threshold: Minimum final similarity score (0-1)
            max_results: Cap on returned results
            excluded_image_ids: Image IDs to exclude (negative feedback / "Not Me")
            metadata_filters: Optional ChromaDB where-clause filters from smart search
            extra_query_text: Additional BM25 query text from natural language search

        Returns:
            Dict with results, selfie_hash, feedback_applied, and feedback_stats
        """
        # ── Detect face in selfie ────────────────────────────────────
        image_np = load_image_for_detection(selfie_path)
        selfie_face = face_service.detect_single_face(image_np)

        query_embedding = selfie_face["embedding"]
        selfie_hash = feedback_service.compute_selfie_hash(query_embedding)

        # Extract metadata from selfie face for BM25 query construction
        selfie_meta = extract_face_metadata(selfie_face["raw_face"], image_np)
        query_text = selfie_meta.get("metadata_text", "")

        # Append extra query text from smart search if provided
        if extra_query_text:
            query_text = f"{query_text} {extra_query_text}".strip()

        # ── Stage 1: Broad vector recall ─────────────────────────────
        # Use a lower threshold for recall; re-ranking will filter later
        recall_threshold = max(0.3, threshold - 0.20)
        broad_n = min(max_results * 3, 300)

        # Build optional pre-filter from selfie metadata (gender)
        where_filter = metadata_filters.copy() if metadata_filters else None
        selfie_gender = selfie_meta.get("gender")
        if selfie_gender and not where_filter:
            where_filter = {"gender": selfie_gender}
        elif selfie_gender and where_filter and "gender" not in where_filter:
            where_filter["gender"] = selfie_gender

        vector_results = vector_service.query_embeddings(
            event_id=event_id,
            query_embedding=query_embedding,
            n_results=broad_n,
            where=where_filter,
        )

        empty_response = {
            "results": [],
            "selfie_hash": selfie_hash,
            "feedback_applied": False,
            "feedback_stats": feedback_service.get_feedback_stats(event_id, selfie_hash),
        }

        # Fall back to unfiltered query if gender filter returned too few results
        result_count = len(vector_results["ids"][0]) if vector_results["ids"] and vector_results["ids"][0] else 0
        if result_count < self.MIN_FILTERED_RESULTS and where_filter:
            logger.debug(
                "filtered_query_fallback",
                extra={"event_id": event_id, "filtered_count": result_count},
            )
            vector_results = vector_service.query_embeddings(
                event_id=event_id,
                query_embedding=query_embedding,
                n_results=broad_n,
            )

        if not vector_results["ids"] or not vector_results["ids"][0]:
            return empty_response

        # Build candidate pool from vector results
        candidates = {}
        for i, face_id in enumerate(vector_results["ids"][0]):
            distance = vector_results["distances"][0][i]
            similarity = 1 - distance
            if similarity < recall_threshold:
                continue

            meta = (
                vector_results["metadatas"][0][i]
                if vector_results.get("metadatas") and vector_results["metadatas"][0]
                else {}
            )
            doc = (
                vector_results["documents"][0][i]
                if vector_results.get("documents")
                and vector_results["documents"][0]
                and vector_results["documents"][0][i]
                else ""
            )

            candidates[face_id] = {
                "vector_similarity": similarity,
                "metadata": meta,
                "document": doc,
                "vector_rank": i,
            }

        if not candidates:
            return empty_response

        # ── Stage 2: BM25 re-scoring (with caching) ───────────────────
        candidate_ids = list(candidates.keys())
        candidate_docs = [candidates[fid]["document"] for fid in candidate_ids]

        bm25_scores = self._bm25_rescore_cached(
            event_id, candidate_ids, candidate_docs, query_text
        )

        for i, face_id in enumerate(candidate_ids):
            candidates[face_id]["bm25_score"] = bm25_scores[i] if bm25_scores is not None else 0.0
            candidates[face_id]["bm25_rank"] = 0  # will be set below

        # Compute BM25 ranks
        bm25_order = sorted(
            candidate_ids, key=lambda fid: candidates[fid]["bm25_score"], reverse=True
        )
        for rank, fid in enumerate(bm25_order):
            candidates[fid]["bm25_rank"] = rank

        # ── Stage 3: Reciprocal Rank Fusion + quality boost ──────────
        # Maximum possible RRF score (rank 0): 1/RRF_K
        max_rrf = 1.0 / self.RRF_K

        for face_id, cand in candidates.items():
            # RRF score (higher is better)
            vector_rrf = 1.0 / (self.RRF_K + cand["vector_rank"])
            bm25_rrf = 1.0 / (self.RRF_K + cand["bm25_rank"])

            rrf_score = (
                self.VECTOR_WEIGHT * vector_rrf + self.BM25_WEIGHT * bm25_rrf
            )

            # Quality boost from metadata
            quality_boost = self._compute_quality_boost(cand["metadata"])

            # Additive composite: vector similarity is dominant, RRF and quality
            # are bounded adjustments. All components normalized to [0,1].
            rrf_normalized = rrf_score / max_rrf if max_rrf > 0 else 0.0
            quality_normalized = (quality_boost + 1.0) / 2.0  # shift [-1,1] to [0,1]

            if bm25_scores is not None:
                cand["composite_score"] = max(0.0, min(1.0,
                    0.80 * cand["vector_similarity"]
                    + 0.12 * rrf_normalized
                    + 0.08 * quality_normalized
                ))
            else:
                # No BM25 data — vector-only scoring with quality
                cand["composite_score"] = max(0.0, min(1.0,
                    0.90 * cand["vector_similarity"]
                    + 0.10 * quality_normalized
                ))

        # ── Stage 4: Adaptive reranking from feedback ────────────────
        personal_negatives = feedback_service.get_hard_negatives(event_id, selfie_hash)
        global_negatives = feedback_service.get_global_hard_negatives(event_id)
        feedback_applied = len(personal_negatives) > 0 or len(global_negatives) > 0

        # Batch lookup reputation penalties for all candidates
        all_candidate_ids = list(candidates.keys())
        reputation_penalties = feedback_service.get_reputation_penalties(
            event_id, all_candidate_ids
        )

        if feedback_applied or reputation_penalties:
            # Batch-retrieve candidate embeddings for penalty computation
            candidate_embeddings = {}
            if personal_negatives or global_negatives:
                emb_list = vector_service.get_embeddings_by_ids(
                    event_id, all_candidate_ids
                )
                for i, cid in enumerate(all_candidate_ids):
                    if i < len(emb_list) and emb_list[i] is not None:
                        candidate_embeddings[cid] = np.array(
                            emb_list[i], dtype=np.float32
                        )

            for face_id, cand in candidates.items():
                penalty = 0.0

                cand_emb = candidate_embeddings.get(face_id)
                if cand_emb is not None:
                    # Personal hard negative penalty
                    if personal_negatives:
                        penalty += feedback_service.compute_hard_negative_penalty(
                            cand_emb,
                            personal_negatives,
                            strength=self.PERSONAL_NEG_STRENGTH,
                        )

                    # Global confuser penalty
                    if global_negatives:
                        penalty += feedback_service.compute_hard_negative_penalty(
                            cand_emb,
                            global_negatives,
                            strength=self.GLOBAL_NEG_STRENGTH,
                        )

                # Reputation penalty (pre-computed, direct add)
                penalty += reputation_penalties.get(face_id, 0.0)

                cand["feedback_penalty"] = round(penalty, 4)
                cand["composite_score"] = max(1e-6, cand["composite_score"] + penalty)
        else:
            for cand in candidates.values():
                cand["feedback_penalty"] = 0.0

        # ── Deduplicate by image_id, keep best face per image ────────
        # Batch lookup: single query instead of N individual queries
        face_lookup = {
            f.embedding_id: f
            for f in Face.query.filter(Face.embedding_id.in_(all_candidate_ids)).all()
        }

        excluded = set(excluded_image_ids or [])
        image_best = {}
        for face_id, cand in candidates.items():
            face = face_lookup.get(face_id)
            if not face:
                continue

            image_id = face.image_id

            # Skip excluded images (negative feedback)
            if image_id in excluded:
                continue

            score = cand["composite_score"]

            if image_id not in image_best or score > image_best[image_id]["score"]:
                image_best[image_id] = {
                    "score": score,
                    "face_id": face_id,
                    "vector_sim": cand["vector_similarity"],
                    "bm25_score": cand["bm25_score"],
                    "quality_boost": self._compute_quality_boost(cand["metadata"]),
                    "feedback_penalty": cand["feedback_penalty"],
                    "metadata": cand["metadata"],
                }

        # Track which embeddings were shown for reputation scoring
        shown_embedding_ids = [
            match["face_id"] for match in image_best.values()
        ]
        feedback_service.increment_shown(event_id, shown_embedding_ids)

        # Get feedback stats for frontend
        feedback_stats = feedback_service.get_feedback_stats(event_id, selfie_hash)

        # ── Filter by threshold and build response ───────────────────
        # Batch load images instead of N individual queries
        image_ids_to_load = [
            img_id for img_id, match in image_best.items()
            if match["score"] >= threshold
        ]
        images_by_id = {
            img.id: img
            for img in Image.query.filter(Image.id.in_(image_ids_to_load)).all()
        } if image_ids_to_load else {}

        results = []
        for image_id, match in sorted(
            image_best.items(), key=lambda x: x[1]["score"], reverse=True
        ):
            if match["score"] < threshold:
                continue

            image = images_by_id.get(image_id)
            if not image:
                continue

            results.append(
                {
                    "image": image.to_dict(),
                    "similarity": round(match["score"], 4),
                    "match_details": {
                        "vector_similarity": round(match["vector_sim"], 4),
                        "bm25_score": round(match["bm25_score"], 4),
                        "quality_boost": round(match["quality_boost"], 4),
                        "feedback_penalty": match["feedback_penalty"],
                        "face_quality": match["metadata"].get("face_quality"),
                        "is_frontal": match["metadata"].get("is_frontal"),
                        "prominence": match["metadata"].get("prominence"),
                        "scene_type": match["metadata"].get("scene_type"),
                    },
                }
            )

            if len(results) >= max_results:
                break

        return {
            "results": results,
            "selfie_hash": selfie_hash,
            "feedback_applied": feedback_applied,
            "feedback_stats": feedback_stats,
        }

    def search_by_metadata(
        self,
        event_id: str,
        query_text: str,
        metadata_filters: dict | None = None,
        max_results: int = 100,
    ) -> dict:
        """Search by metadata/scene only (no face matching).

        Used for natural language queries like "dancing photos at night"
        without a selfie upload.
        """
        # Get all documents from the event for BM25 ranking
        all_docs = vector_service.get_all_documents(event_id)
        if not all_docs["ids"]:
            return {"results": [], "count": 0}

        doc_ids = all_docs["ids"]
        documents = all_docs.get("documents", [""] * len(doc_ids))
        metadatas = all_docs.get("metadatas", [{}] * len(doc_ids))

        # BM25 score all documents against query
        bm25_scores = self._bm25_rescore(documents, query_text)
        if bm25_scores is None:
            return {"results": [], "count": 0}

        # Build scored candidates
        scored = []
        for i, doc_id in enumerate(doc_ids):
            meta = metadatas[i] if i < len(metadatas) else {}

            # Apply metadata filters if provided
            if metadata_filters:
                skip = False
                for key, value in metadata_filters.items():
                    if meta.get(key) != value:
                        skip = True
                        break
                if skip:
                    continue

            scored.append({
                "embedding_id": doc_id,
                "bm25_score": bm25_scores[i],
                "metadata": meta,
            })

        # Sort by BM25 score
        scored.sort(key=lambda x: x["bm25_score"], reverse=True)
        scored = scored[:max_results]

        # Resolve to images via Face table
        embedding_ids = [s["embedding_id"] for s in scored]
        face_lookup = {
            f.embedding_id: f
            for f in Face.query.filter(Face.embedding_id.in_(embedding_ids)).all()
        }

        image_ids = list({
            face_lookup[s["embedding_id"]].image_id
            for s in scored
            if s["embedding_id"] in face_lookup
        })
        images_by_id = {
            img.id: img
            for img in Image.query.filter(Image.id.in_(image_ids)).all()
        }

        results = []
        seen_images = set()
        for s in scored:
            face = face_lookup.get(s["embedding_id"])
            if not face or face.image_id in seen_images:
                continue
            seen_images.add(face.image_id)

            image = images_by_id.get(face.image_id)
            if not image:
                continue

            results.append({
                "image": image.to_dict(),
                "relevance_score": round(s["bm25_score"], 4),
                "match_details": {
                    "scene_type": s["metadata"].get("scene_type"),
                    "face_quality": s["metadata"].get("face_quality"),
                },
            })

        return {"results": results, "count": len(results)}

    def _bm25_rescore_cached(
        self,
        event_id: str,
        candidate_ids: list[str],
        candidate_docs: list[str],
        query_text: str,
    ) -> list[float] | None:
        """BM25 scoring with per-event index caching.

        Builds BM25 index over the full event corpus (not just vector recall
        candidates) for better ranking, then scores only the candidates.
        """
        if not query_text or not query_text.strip():
            return None

        with _bm25_lock:
            cached = _bm25_cache.get(event_id)

        # Try to use cached full-corpus BM25 index
        if cached:
            cached_count, bm25, cached_ids = cached
            # Verify cache is still valid (doc count hasn't changed)
            all_docs = vector_service.get_all_documents(event_id)
            current_count = len(all_docs.get("ids", []))
            if current_count == cached_count:
                # Score candidates against cached index
                return self._score_candidates_with_bm25(
                    bm25, cached_ids, candidate_ids, query_text
                )

        # Cache miss or stale — rebuild from full corpus
        all_docs = vector_service.get_all_documents(event_id)
        all_ids = all_docs.get("ids", [])
        all_documents = all_docs.get("documents", [])

        if not all_ids or not all_documents:
            # Fall back to candidate-only BM25
            return self._bm25_rescore(candidate_docs, query_text)

        tokenized = [doc.lower().split() if doc else [] for doc in all_documents]
        if all(len(d) == 0 for d in tokenized):
            return None

        bm25 = BM25Okapi(tokenized)

        with _bm25_lock:
            _bm25_cache[event_id] = (len(all_ids), bm25, all_ids)

        return self._score_candidates_with_bm25(
            bm25, all_ids, candidate_ids, query_text
        )

    def _score_candidates_with_bm25(
        self,
        bm25: BM25Okapi,
        corpus_ids: list[str],
        candidate_ids: list[str],
        query_text: str,
    ) -> list[float] | None:
        """Score specific candidates against a pre-built BM25 index."""
        query_tokens = query_text.lower().split()
        if not query_tokens:
            return None

        all_scores = bm25.get_scores(query_tokens)

        # Map corpus positions to IDs
        id_to_score = {}
        for i, cid in enumerate(corpus_ids):
            id_to_score[cid] = all_scores[i]

        # Extract scores for just the candidates
        scores = [id_to_score.get(cid, 0.0) for cid in candidate_ids]

        # Normalize to 0-1
        max_score = max(scores) if scores else 1.0
        if max_score > 0:
            scores = [s / max_score for s in scores]

        return scores

    def _bm25_rescore(
        self, candidate_docs: list[str], query_text: str
    ) -> list[float] | None:
        """Score candidate documents against query using BM25.

        Tokenizes on whitespace. Returns normalized scores (0-1),
        or None if BM25 scoring is not possible (empty query/docs).
        """
        if not query_text or not query_text.strip():
            return None

        if not candidate_docs:
            return None

        # Tokenize
        tokenized_docs = [doc.lower().split() for doc in candidate_docs]
        query_tokens = query_text.lower().split()

        if not query_tokens:
            return None

        # Handle empty tokenized docs
        if all(len(d) == 0 for d in tokenized_docs):
            return None

        # Build BM25 index
        bm25 = BM25Okapi(tokenized_docs)
        scores = bm25.get_scores(query_tokens).tolist()

        # Normalize to 0-1
        max_score = max(scores) if scores else 1.0
        if max_score > 0:
            scores = [s / max_score for s in scores]

        return scores

    def _compute_quality_boost(self, metadata: dict) -> float:
        """Compute a quality boost multiplier from face/image metadata.

        Returns value between -1 and +1:
        - Positive: high quality, frontal, prominent, sharp
        - Negative: low quality, profile, tiny, blurry
        """
        boost = 0.0

        # Face quality (0-1) → most important signal
        fq = metadata.get("face_quality", 0.5)
        boost += (fq - 0.5) * 1.0  # range: -0.5 to +0.5

        # Frontal faces get a bonus
        if metadata.get("is_frontal"):
            boost += 0.15

        # Prominent faces (larger in frame) get a bonus
        prominence = metadata.get("prominence", 0.01)
        if prominence > 0.03:
            boost += 0.1
        elif prominence < 0.005:
            boost -= 0.1

        # Image sharpness
        sharpness = metadata.get("sharpness", 100)
        if sharpness > 200:
            boost += 0.05
        elif sharpness < 30:
            boost -= 0.1

        # Center-positioned faces slight bonus
        center_dist = metadata.get("center_dist", 0.5)
        if center_dist < 0.25:
            boost += 0.05

        return max(-1.0, min(1.0, boost))
