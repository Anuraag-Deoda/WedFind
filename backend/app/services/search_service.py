"""Hybrid RAG search pipeline for face matching.

Four-stage retrieval:
  Stage 1 — Broad vector recall: Query ChromaDB with a lower threshold to
            maximize recall. Returns top-N candidates with cosine similarity.

  Stage 2 — BM25 re-scoring: Build a BM25 index from textual metadata
            descriptions of all faces in the event. Score each candidate
            against a query document built from the selfie's face attributes.
            This captures semantic signals the embedding can't (age bracket,
            scene type, frontality).

  Stage 3 — Reciprocal Rank Fusion + quality boosting: Fuse vector and BM25
            rankings using RRF. Then apply quality multipliers (face quality,
            prominence, sharpness) to produce the final composite score.

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

import numpy as np
from rank_bm25 import BM25Okapi

from ..services import face_service, vector_service
from ..services.image_service import load_image_for_detection
from ..services.metadata_service import extract_face_metadata
from ..services import feedback_service
from ..models import Face, Image


class SearchService:

    # Reciprocal Rank Fusion constant (standard: 60)
    RRF_K = 60

    # Weight balance: how much vector vs BM25 matters in fusion
    VECTOR_WEIGHT = 0.70
    BM25_WEIGHT = 0.30

    # Quality boost weights
    QUALITY_BOOST_WEIGHT = 0.15

    # Stage 4 penalty weights
    PERSONAL_NEG_STRENGTH = 0.15
    GLOBAL_NEG_STRENGTH = 0.08

    def search(
        self,
        event_id: str,
        selfie_path: str,
        threshold: float = 0.70,
        max_results: int = 100,
        excluded_image_ids: list[str] | None = None,
    ) -> dict:
        """Multi-stage hybrid search for photos containing the selfie person.

        Args:
            event_id: Event to search within
            selfie_path: Path to selfie image
            threshold: Minimum final similarity score (0-1)
            max_results: Cap on returned results
            excluded_image_ids: Image IDs to exclude (negative feedback / "Not Me")

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

        # ── Stage 1: Broad vector recall ─────────────────────────────
        # Use a lower threshold for recall; re-ranking will filter later
        recall_threshold = max(0.3, threshold - 0.20)
        broad_n = min(max_results * 3, 300)

        vector_results = vector_service.query_embeddings(
            event_id=event_id,
            query_embedding=query_embedding,
            n_results=broad_n,
        )

        empty_response = {
            "results": [],
            "selfie_hash": selfie_hash,
            "feedback_applied": False,
            "feedback_stats": feedback_service.get_feedback_stats(event_id, selfie_hash),
        }

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

        # ── Stage 2: BM25 re-scoring ────────────────────────────────
        candidate_ids = list(candidates.keys())
        candidate_docs = [candidates[fid]["document"] for fid in candidate_ids]

        bm25_scores = self._bm25_rescore(candidate_docs, query_text)

        for i, face_id in enumerate(candidate_ids):
            candidates[face_id]["bm25_score"] = bm25_scores[i]
            candidates[face_id]["bm25_rank"] = 0  # will be set below

        # Compute BM25 ranks
        bm25_order = sorted(
            candidate_ids, key=lambda fid: candidates[fid]["bm25_score"], reverse=True
        )
        for rank, fid in enumerate(bm25_order):
            candidates[fid]["bm25_rank"] = rank

        # ── Stage 3: Reciprocal Rank Fusion + quality boost ──────────
        for face_id, cand in candidates.items():
            # RRF score (higher is better)
            vector_rrf = 1.0 / (self.RRF_K + cand["vector_rank"])
            bm25_rrf = 1.0 / (self.RRF_K + cand["bm25_rank"])

            rrf_score = (
                self.VECTOR_WEIGHT * vector_rrf + self.BM25_WEIGHT * bm25_rrf
            )

            # Quality boost from metadata
            quality_boost = self._compute_quality_boost(cand["metadata"])

            # Composite score: blend of vector similarity and RRF, boosted by quality
            # Base: vector similarity (strongest signal)
            # Modifier: RRF normalized + quality boost
            base_score = cand["vector_similarity"]
            rrf_modifier = rrf_score * 50  # scale RRF to ~0-1 range
            quality_modifier = 1.0 + (self.QUALITY_BOOST_WEIGHT * quality_boost)

            cand["composite_score"] = base_score * quality_modifier * (1.0 + rrf_modifier * 0.05)

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
                cand["composite_score"] = max(0.0, cand["composite_score"] + penalty)
        else:
            for cand in candidates.values():
                cand["feedback_penalty"] = 0.0

        # ── Deduplicate by image_id, keep best face per image ────────
        excluded = set(excluded_image_ids or [])
        image_best = {}
        for face_id, cand in candidates.items():
            face = Face.query.filter_by(embedding_id=face_id).first()
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
        results = []
        for image_id, match in sorted(
            image_best.items(), key=lambda x: x[1]["score"], reverse=True
        ):
            if match["vector_sim"] < threshold:
                continue

            image = Image.query.get(image_id)
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

    def _bm25_rescore(
        self, candidate_docs: list[str], query_text: str
    ) -> list[float]:
        """Score candidate documents against query using BM25.

        Tokenizes on whitespace. Returns normalized scores (0-1).
        """
        if not candidate_docs or not query_text:
            return [0.0] * len(candidate_docs)

        # Tokenize
        tokenized_docs = [doc.lower().split() for doc in candidate_docs]
        query_tokens = query_text.lower().split()

        # Handle empty tokenized docs
        if all(len(d) == 0 for d in tokenized_docs):
            return [0.0] * len(candidate_docs)

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
