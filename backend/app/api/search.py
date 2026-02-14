"""Search endpoint with selfie validation, rate limiting, and adaptive feedback."""

import uuid
import logging

from flask import Blueprint, jsonify, request, current_app

from ..extensions import limiter
from ..models import Event

logger = logging.getLogger(__name__)

search_bp = Blueprint("search", __name__)


@search_bp.route("/search", methods=["POST"])
@limiter.limit("20/minute")
def search_faces():
    event_id = request.form.get("event_id")
    if not event_id:
        return jsonify({"error": "event_id is required"}), 400

    event = Event.query.get(event_id)
    if not event or not event.is_active:
        return jsonify({"error": "Invalid or inactive event"}), 404

    threshold = float(
        request.form.get(
            "threshold", current_app.config["FACE_SIMILARITY_THRESHOLD"]
        )
    )
    threshold = max(0.3, min(0.99, threshold))

    selfie = request.files.get("selfie")
    if not selfie:
        return jsonify({"error": "Selfie image is required"}), 400

    # Validate selfie file
    selfie_data = selfie.read()
    from ..services.image_service import validate_image_file
    mime = validate_image_file(selfie_data)
    if not mime:
        return jsonify({"error": "Invalid image file"}), 400

    # Parse excluded image IDs (negative feedback / "Not Me")
    excluded_ids_raw = request.form.get("excluded_image_ids", "")
    excluded_ids = [x.strip() for x in excluded_ids_raw.split(",") if x.strip()] if excluded_ids_raw else []

    # Save selfie temporarily
    from ..services.storage_service import StorageService
    storage = StorageService(current_app.config["STORAGE_DIR"])
    selfie_filename = f"{uuid.uuid4()}.jpg"
    selfie_path = storage.save_selfie(selfie_filename, selfie_data)

    try:
        from ..services.search_service import SearchService
        search_svc = SearchService()
        search_result = search_svc.search(
            event_id=event_id,
            selfie_path=selfie_path,
            threshold=threshold,
            max_results=current_app.config["MAX_SEARCH_RESULTS"],
            excluded_image_ids=excluded_ids,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception(
            "search_failed",
            extra={"event_id": event_id, "error": str(e)},
        )
        return jsonify({"error": "Search failed. Please try again."}), 500
    finally:
        storage.delete_file(selfie_path)

    results = search_result["results"]

    logger.info(
        "search_complete",
        extra={
            "event_id": event_id,
            "results": len(results),
            "threshold": threshold,
            "excluded": len(excluded_ids),
            "feedback_applied": search_result["feedback_applied"],
        },
    )

    return jsonify({
        "results": results,
        "count": len(results),
        "threshold": threshold,
        "selfie_hash": search_result["selfie_hash"],
        "feedback_applied": search_result["feedback_applied"],
        "feedback_stats": search_result["feedback_stats"],
    })


@search_bp.route("/search/smart", methods=["POST"])
@limiter.limit("15/minute")
def smart_search():
    """Natural language + optional face search.

    Accepts text queries like "dancing photos at night" with an optional
    selfie for combined face + scene matching.
    """
    if not current_app.config.get("ENABLE_SMART_SEARCH", True):
        return jsonify({"error": "Smart search is not enabled"}), 501

    event_id = request.form.get("event_id")
    if not event_id:
        return jsonify({"error": "event_id is required"}), 400

    event = Event.query.get(event_id)
    if not event or not event.is_active:
        return jsonify({"error": "Invalid or inactive event"}), 404

    query = request.form.get("query", "").strip()
    selfie = request.files.get("selfie")

    if not query and not selfie:
        return jsonify({"error": "Either query text or selfie image is required"}), 400

    threshold = float(
        request.form.get(
            "threshold", current_app.config["FACE_SIMILARITY_THRESHOLD"]
        )
    )
    threshold = max(0.3, min(0.99, threshold))
    max_results = min(
        int(request.form.get("max_results", current_app.config["MAX_SEARCH_RESULTS"])),
        200,
    )

    # Parse excluded image IDs
    excluded_ids_raw = request.form.get("excluded_image_ids", "")
    excluded_ids = [x.strip() for x in excluded_ids_raw.split(",") if x.strip()] if excluded_ids_raw else []

    # ── Parse natural language query via LLM ──────────────────────────
    metadata_filters = None
    extra_query_text = ""
    parsed_query = None

    if query:
        from ..services.llm_service import parse_search_query, build_search_filters
        parsed_query = parse_search_query(query)
        if parsed_query:
            metadata_filters, extra_query_text = build_search_filters(parsed_query)
        else:
            # Fallback: use raw query as BM25 text
            extra_query_text = query

    # ── Face + Scene hybrid search (selfie provided) ──────────────────
    if selfie:
        selfie_data = selfie.read()
        from ..services.image_service import validate_image_file
        mime = validate_image_file(selfie_data)
        if not mime:
            return jsonify({"error": "Invalid image file"}), 400

        from ..services.storage_service import StorageService
        storage = StorageService(current_app.config["STORAGE_DIR"])
        selfie_filename = f"{uuid.uuid4()}.jpg"
        selfie_path = storage.save_selfie(selfie_filename, selfie_data)

        try:
            from ..services.search_service import SearchService
            search_svc = SearchService()
            search_result = search_svc.search(
                event_id=event_id,
                selfie_path=selfie_path,
                threshold=threshold,
                max_results=max_results,
                excluded_image_ids=excluded_ids,
                metadata_filters=metadata_filters,
                extra_query_text=extra_query_text,
            )
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        except Exception as e:
            logger.exception("smart_search_failed", extra={"event_id": event_id, "error": str(e)})
            return jsonify({"error": "Search failed. Please try again."}), 500
        finally:
            storage.delete_file(selfie_path)

        logger.info(
            "smart_search_complete",
            extra={
                "event_id": event_id,
                "mode": "hybrid",
                "query": query,
                "results": len(search_result["results"]),
                "parsed_query": parsed_query,
            },
        )

        return jsonify({
            "results": search_result["results"],
            "count": len(search_result["results"]),
            "mode": "hybrid",
            "query": query,
            "parsed_query": parsed_query,
            "threshold": threshold,
            "selfie_hash": search_result["selfie_hash"],
            "feedback_applied": search_result["feedback_applied"],
            "feedback_stats": search_result["feedback_stats"],
        })

    # ── Scene-only search (no selfie) ─────────────────────────────────
    from ..services.search_service import SearchService
    search_svc = SearchService()

    try:
        result = search_svc.search_by_metadata(
            event_id=event_id,
            query_text=extra_query_text or query,
            metadata_filters=metadata_filters,
            max_results=max_results,
        )
    except Exception as e:
        logger.exception("smart_search_metadata_failed", extra={"event_id": event_id, "error": str(e)})
        return jsonify({"error": "Search failed. Please try again."}), 500

    logger.info(
        "smart_search_complete",
        extra={
            "event_id": event_id,
            "mode": "metadata",
            "query": query,
            "results": result["count"],
            "parsed_query": parsed_query,
        },
    )

    return jsonify({
        "results": result["results"],
        "count": result["count"],
        "mode": "metadata",
        "query": query,
        "parsed_query": parsed_query,
    })


@search_bp.route("/search/feedback", methods=["POST"])
@limiter.limit("60/minute")
def search_feedback():
    """Record negative feedback ('Not Me') for a search result.

    Persists feedback to the database and updates face reputation scores.
    Requires selfie_hash from the search response to link feedback to the searcher.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "JSON body required"}), 400

    image_id = data.get("image_id")
    event_id = data.get("event_id")
    selfie_hash = data.get("selfie_hash")

    if not image_id or not event_id or not selfie_hash:
        return jsonify({"error": "image_id, event_id, and selfie_hash required"}), 400

    # Look up the face embedding ID for this image
    from ..models import Face
    face = Face.query.filter_by(image_id=image_id).first()

    if not face:
        logger.warning(
            "feedback_no_face",
            extra={"event_id": event_id, "image_id": image_id},
        )
        return jsonify({"status": "recorded", "image_id": image_id})

    from ..services import feedback_service
    feedback_service.record_feedback(
        event_id=event_id,
        image_id=image_id,
        selfie_hash=selfie_hash,
        rejected_embedding_id=face.embedding_id,
        rejected_face_id=face.id,
    )

    stats = feedback_service.get_feedback_stats(event_id, selfie_hash)

    logger.info(
        "search_negative_feedback",
        extra={
            "event_id": event_id,
            "image_id": image_id,
            "embedding_id": face.embedding_id,
            "selfie_hash": selfie_hash[:12],
        },
    )

    return jsonify({
        "status": "recorded",
        "image_id": image_id,
        "feedback_stats": stats,
    })
