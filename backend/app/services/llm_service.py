"""LLM service for natural language query parsing and content generation.

Uses OpenAI GPT-4o-mini for:
- Parsing natural language search queries into structured filters
- Generating album captions and summaries

Includes Redis caching for parsed queries (1 hour TTL).
Falls back gracefully if OpenAI is unavailable.
"""

import json
import logging
import hashlib

import redis as redis_lib
from flask import current_app

logger = logging.getLogger(__name__)

# ── Query Parser ─────────────────────────────────────────────────────

QUERY_PARSE_SYSTEM_PROMPT = """You are a wedding photo search query parser. Given a user's natural language query about wedding photos, extract structured filters.

Return a JSON object with these fields (use null for any field not mentioned):
{
    "scene": string or null — one of: "ceremony", "varmala", "pheras", "haldi", "mehndi", "sangeet", "reception", "dance", "dinner", "outdoor", "indoor", "stage", "mandap", "baraat", "vidaai", "cocktail", "getting_ready", "portrait",
    "lighting": string or null — one of: "day", "night", "golden_hour", "indoor", "flash", "candle",
    "context": string or null — one of: "stage", "mandap", "dance_floor", "garden", "entrance", "hotel", "temple", "beach", "poolside",
    "people": string or null — one of: "bride", "groom", "couple", "group", "solo", "family", "friends",
    "mood": string or null — one of: "emotional", "joyful", "candid", "posed", "romantic", "fun", "serious",
    "requires_face_match": boolean — true if the query implies finding photos OF the searching person (e.g., "photos of me", "where I am"), false if it's a general scene query (e.g., "dancing photos")
}

Only return the JSON object, nothing else."""

QUERY_CACHE_TTL = 3600  # 1 hour


def parse_search_query(query: str) -> dict | None:
    """Parse a natural language search query into structured filters.

    Args:
        query: User's natural language query (e.g., "dancing photos at night")

    Returns:
        Dict with structured filters, or None if parsing fails.
    """
    api_key = current_app.config.get("OPENAI_API_KEY", "")
    if not api_key:
        logger.warning("openai_api_key_not_configured")
        return None

    # Check Redis cache
    cache_key = f"query_parse:{hashlib.sha256(query.encode()).hexdigest()[:16]}"
    cached = _get_cached(cache_key)
    if cached is not None:
        return cached

    try:
        import openai
        client = openai.OpenAI(api_key=api_key)

        model = current_app.config.get("OPENAI_MODEL", "gpt-4o-mini")
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": QUERY_PARSE_SYSTEM_PROMPT},
                {"role": "user", "content": query},
            ],
            temperature=0.0,
            max_tokens=300,
            response_format={"type": "json_object"},
        )

        result_text = response.choices[0].message.content
        parsed = json.loads(result_text)

        # Cache the result
        _set_cached(cache_key, parsed, QUERY_CACHE_TTL)

        logger.info(
            "query_parsed",
            extra={"query": query, "parsed": parsed},
        )
        return parsed

    except Exception as e:
        logger.error("query_parse_failed", extra={"query": query, "error": str(e)})
        return None


def build_search_filters(parsed_query: dict) -> tuple[dict | None, str]:
    """Convert parsed query into ChromaDB where-clause and BM25 query text.

    Args:
        parsed_query: Dict from parse_search_query()

    Returns:
        Tuple of (chromadb_where_filter or None, bm25_query_text)
    """
    where_filter = {}
    query_terms = []

    if parsed_query.get("scene"):
        where_filter["scene_type"] = parsed_query["scene"]
        query_terms.append(parsed_query["scene"])

    if parsed_query.get("lighting"):
        query_terms.append(parsed_query["lighting"])

    if parsed_query.get("context"):
        query_terms.append(parsed_query["context"])

    if parsed_query.get("people"):
        query_terms.append(parsed_query["people"])

    if parsed_query.get("mood"):
        query_terms.append(parsed_query["mood"])

    return (where_filter if where_filter else None, " ".join(query_terms))


# ── Album Generation ─────────────────────────────────────────────────

CAPTION_SYSTEM_PROMPT = """You are a creative wedding album writer. Given metadata about a group of wedding photos (a "moment"), generate a short, evocative caption (10-20 words) that captures the feeling of that moment.

Be poetic but not cheesy. Reference specific details from the metadata when possible (time of day, setting, number of people). Indian wedding terminology is welcome (sangeet, haldi, pheras, etc.).

Return only the caption text, nothing else."""

ALBUM_TITLE_SYSTEM_PROMPT = """You are a creative wedding album designer. Given a list of moment summaries from a wedding, generate:
1. An album title (5-10 words, creative and personal-feeling)
2. A brief event summary (2-3 sentences capturing the essence of the wedding)

Return as JSON:
{
    "title": "...",
    "summary": "..."
}"""


def generate_moment_caption(moment_metadata: dict) -> str:
    """Generate a caption for a photo moment/cluster.

    Args:
        moment_metadata: Dict with scene_type, time_range, face_count,
                        lighting, dominant_scene, etc.

    Returns:
        Caption string, or a default if generation fails.
    """
    api_key = current_app.config.get("OPENAI_API_KEY", "")
    if not api_key:
        return moment_metadata.get("dominant_scene", "A Moment")

    try:
        import openai
        client = openai.OpenAI(api_key=api_key)

        prompt = f"""Moment details:
- Scene: {moment_metadata.get('dominant_scene', 'unknown')}
- Time: {moment_metadata.get('time_range', 'unknown')}
- Number of photos: {moment_metadata.get('photo_count', 0)}
- Average faces per photo: {moment_metadata.get('avg_faces', 0):.1f}
- Lighting: {moment_metadata.get('lighting', 'unknown')}
- Key mood: {moment_metadata.get('mood', 'joyful')}"""

        model = current_app.config.get("OPENAI_MODEL", "gpt-4o-mini")
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": CAPTION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=50,
        )

        return response.choices[0].message.content.strip().strip('"')

    except Exception as e:
        logger.error("caption_generation_failed", extra={"error": str(e)})
        return moment_metadata.get("dominant_scene", "A Moment")


def generate_album_title_and_summary(moment_summaries: list[str]) -> dict:
    """Generate an album title and summary from all moment descriptions.

    Args:
        moment_summaries: List of moment caption strings

    Returns:
        Dict with "title" and "summary" keys.
    """
    api_key = current_app.config.get("OPENAI_API_KEY", "")
    if not api_key:
        return {"title": "Wedding Album", "summary": "A collection of wedding memories."}

    try:
        import openai
        client = openai.OpenAI(api_key=api_key)

        prompt = f"""This wedding had {len(moment_summaries)} distinct moments:

{chr(10).join(f'- {s}' for s in moment_summaries)}

Generate a creative album title and summary."""

        model = current_app.config.get("OPENAI_MODEL", "gpt-4o-mini")
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": ALBUM_TITLE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.9,
            max_tokens=200,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    except Exception as e:
        logger.error("album_title_generation_failed", extra={"error": str(e)})
        return {"title": "Wedding Album", "summary": "A collection of wedding memories."}


# ── Redis Cache Helpers ──────────────────────────────────────────────

def _get_cached(key: str) -> dict | None:
    try:
        r = redis_lib.from_url(current_app.config.get("CELERY_BROKER_URL", "redis://localhost:6379/0"))
        data = r.get(key)
        if data:
            return json.loads(data)
    except Exception:
        pass
    return None


def _set_cached(key: str, value: dict, ttl: int = 3600):
    try:
        r = redis_lib.from_url(current_app.config.get("CELERY_BROKER_URL", "redis://localhost:6379/0"))
        r.setex(key, ttl, json.dumps(value))
    except Exception:
        pass
