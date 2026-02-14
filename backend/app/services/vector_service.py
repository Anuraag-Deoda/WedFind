"""ChromaDB vector store with rich metadata for hybrid retrieval.

Each event gets its own collection. Embeddings are stored with extensive
metadata (face attributes, image quality, scene info) enabling filtered
queries and metadata-boosted re-ranking.
"""

import chromadb
from flask import current_app

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


def add_embedding(
    event_id: str,
    embedding_id: str,
    embedding: list[float],
    metadata: dict | None = None,
    document: str | None = None,
):
    """Add a face embedding with rich metadata to the event's collection.

    Args:
        event_id: Event identifier
        embedding_id: Unique ID for this embedding
        embedding: 512-dim face embedding
        metadata: Flat dict of filterable attributes (age, gender, quality, etc.)
        document: Text description for the embedding (used by ChromaDB's internal search)
    """
    collection = get_or_create_collection(event_id)

    add_kwargs = {
        "ids": [embedding_id],
        "embeddings": [embedding],
    }

    if metadata:
        # ChromaDB only supports str, int, float, bool in metadata
        clean_meta = {}
        for k, v in metadata.items():
            if v is not None and k != "doc_text":
                if isinstance(v, (str, int, float, bool)):
                    clean_meta[k] = v
        add_kwargs["metadatas"] = [clean_meta]

    if document:
        add_kwargs["documents"] = [document]
    elif metadata and metadata.get("doc_text"):
        add_kwargs["documents"] = [metadata["doc_text"]]

    collection.add(**add_kwargs)


def query_embeddings(
    event_id: str,
    query_embedding: list[float],
    n_results: int = 100,
    where: dict | None = None,
) -> dict:
    """Query the event's collection for similar faces with optional metadata filters.

    Args:
        event_id: Event identifier
        query_embedding: 512-dim query embedding
        n_results: Max results to return
        where: ChromaDB where filter dict (e.g. {"is_frontal": True})

    Returns dict with 'ids', 'distances', 'metadatas', 'documents'.
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

    return collection.query(**query_kwargs)


def get_all_documents(event_id: str) -> dict:
    """Get all documents and metadata from a collection for BM25 indexing.

    Returns dict with 'ids', 'documents', 'metadatas'.
    """
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
    """Retrieve stored embeddings by their IDs.

    Essential for hard negative mining — fetches the actual vectors from ChromaDB
    so we can compute cosine similarity penalties against candidate faces.

    Args:
        event_id: Event identifier
        embedding_ids: List of ChromaDB embedding IDs to retrieve

    Returns:
        List of embedding vectors (512-dim float lists). Missing IDs are omitted.
    """
    if not embedding_ids:
        return []

    collection = get_or_create_collection(event_id)
    try:
        result = collection.get(ids=embedding_ids, include=["embeddings"])
        return result.get("embeddings", []) or []
    except Exception:
        return []


def delete_embeddings(event_id: str, embedding_ids: list[str]):
    """Delete specific embeddings from an event's collection."""
    if not embedding_ids:
        return
    collection = get_or_create_collection(event_id)
    collection.delete(ids=embedding_ids)
