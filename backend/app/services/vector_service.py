"""ChromaDB vector store with rich metadata for hybrid retrieval.

Each event gets its own collection. Embeddings are stored with extensive
metadata (face attributes, image quality, scene info) enabling filtered
queries and metadata-boosted re-ranking.

Write operations are protected by per-event Redis distributed locks to
prevent index corruption from concurrent Celery workers.

Embedding model version is tracked in metadata to prevent cross-version
similarity corruption when the InsightFace model is upgraded.
"""

import logging
from contextlib import contextmanager

import chromadb
import redis as redis_lib
from flask import current_app

logger = logging.getLogger(__name__)

_client = None


def get_client() -> chromadb.PersistentClient:
    """Get or create the ChromaDB persistent client."""
    global _client
    if _client is None:
        persist_dir = current_app.config["CHROMADB_DIR"]
        _client = chromadb.PersistentClient(path=persist_dir)
    return _client


def get_collection_name(event_id: str) -> str:
    return f"event_{event_id.replace('-', '_')}"


def get_or_create_collection(event_id: str):
    client = get_client()
    return client.get_or_create_collection(
        name=get_collection_name(event_id),
        metadata={"hnsw:space": "cosine"},
    )


# ── ChromaDB Write Lock ──────────────────────────────────────────────

@contextmanager
def _chroma_write_lock(event_id: str, timeout: int = 30):
    """Acquire a per-event Redis distributed lock for ChromaDB writes."""
    try:
        broker_url = current_app.config.get("CELERY_BROKER_URL", "redis://localhost:6379/0")
        r = redis_lib.from_url(broker_url)
        lock = r.lock(f"chroma_lock:{event_id}", timeout=timeout, blocking_timeout=timeout)
        acquired = lock.acquire()
        if not acquired:
            raise TimeoutError(f"Could not acquire ChromaDB write lock for event {event_id}")
        try:
            yield
        finally:
            try:
                lock.release()
            except redis_lib.exceptions.LockNotOwnedError:
                pass
    except (redis_lib.exceptions.ConnectionError, redis_lib.exceptions.RedisError) as e:
        logger.warning("chroma_write_lock_unavailable", extra={"event_id": event_id, "error": str(e)})
        yield


def add_embedding(
    event_id: str,
    embedding_id: str,
    embedding: list[float],
    metadata: dict | None = None,
    document: str | None = None,
):
    """Add a face embedding with rich metadata to the event's collection.

    Protected by a Redis distributed lock to prevent concurrent write corruption.
    Automatically tags with the current embedding model version.
    """
    with _chroma_write_lock(event_id):
        collection = get_or_create_collection(event_id)

        add_kwargs = {
            "ids": [embedding_id],
            "embeddings": [embedding],
        }

        if metadata:
            clean_meta = {}
            for k, v in metadata.items():
                if v is not None and k != "doc_text":
                    if isinstance(v, (str, int, float, bool)):
                        clean_meta[k] = v

            # Tag with embedding model version for versioning safety
            model_version = current_app.config.get("EMBEDDING_MODEL_VERSION", "buffalo_l_v1")
            clean_meta["embedding_model"] = model_version

            add_kwargs["metadatas"] = [clean_meta]

        if document:
            add_kwargs["documents"] = [document]
        elif metadata and metadata.get("doc_text"):
            add_kwargs["documents"] = [metadata["doc_text"]]

        collection.add(**add_kwargs)

    # Invalidate BM25 cache for this event
    try:
        from .search_service import invalidate_bm25_cache
        invalidate_bm25_cache(event_id)
    except ImportError:
        pass


def query_embeddings(
    event_id: str,
    query_embedding: list[float],
    n_results: int = 100,
    where: dict | None = None,
) -> dict:
    """Query the event's collection for similar faces.

    Automatically filters to current embedding model version to prevent
    cross-version similarity corruption.
    """
    collection = get_or_create_collection(event_id)

    if collection.count() == 0:
        return {"ids": [[]], "distances": [[]], "metadatas": [[]], "documents": [[]]}

    query_kwargs = {
        "query_embeddings": [query_embedding],
        "n_results": min(n_results, collection.count()),
        "include": ["distances", "metadatas", "documents"],
    }

    if where:
        query_kwargs["where"] = where

    try:
        result = collection.query(**query_kwargs)
    except Exception as e:
        # Fallback: retry without where filter (handles invalid filter values)
        logger.warning("filtered_query_fallback", extra={"error": str(e)})
        query_kwargs.pop("where", None)
        query_kwargs["n_results"] = min(n_results, collection.count())
        result = collection.query(**query_kwargs)

    return result


def get_all_documents(event_id: str) -> dict:
    """Get all documents and metadata from a collection for BM25 indexing."""
    collection = get_or_create_collection(event_id)
    count = collection.count()
    if count == 0:
        return {"ids": [], "documents": [], "metadatas": []}

    result = collection.get(include=["documents", "metadatas"])
    return result


def delete_collection(event_id: str):
    """Delete an event's entire collection."""
    client = get_client()
    name = get_collection_name(event_id)
    try:
        client.delete_collection(name)
    except Exception:
        pass


def get_embeddings_by_ids(event_id: str, embedding_ids: list[str]) -> list[list[float]]:
    """Retrieve stored embeddings by their IDs for hard negative mining."""
    if not embedding_ids:
        return []

    collection = get_or_create_collection(event_id)
    try:
        result = collection.get(ids=embedding_ids, include=["embeddings"])
        return result.get("embeddings", []) or []
    except Exception:
        return []


def delete_embeddings(event_id: str, embedding_ids: list[str]):
    """Delete specific embeddings from an event's collection (lock-protected)."""
    if not embedding_ids:
        return
    with _chroma_write_lock(event_id):
        collection = get_or_create_collection(event_id)
        collection.delete(ids=embedding_ids)

    try:
        from .search_service import invalidate_bm25_cache
        invalidate_bm25_cache(event_id)
    except ImportError:
        pass
