"""
curriculum.py
-------------
Teacher curriculum PDF upload and disease search via Human Delta.

Teachers upload their med school's curriculum PDF. Human Delta indexes it.
We then search that indexed content to surface diseases from our KB that
appear in the curriculum — letting teachers build cases grounded in what
their students are actually studying.
"""

import os

import requests

from knowledge_base import list_diseases


HD_BASE = "https://api.humandelta.ai"


def _upload_raw(api_key: str, file_bytes: bytes, filename: str) -> str:
    """Upload PDF via raw requests (SDK maps 'id' -> 'doc_id' incorrectly, returns empty). Returns real doc id."""
    res = requests.post(
        f"{HD_BASE}/v1/documents",
        headers={"Authorization": f"Bearer {api_key}"},
        files={"file": (filename, file_bytes, "application/pdf")},
        data={"category": "curriculum", "doc_name": filename},
    )
    res.raise_for_status()
    return res.json()["id"]


def _get_preview_text(api_key: str, doc_id: str) -> str:
    """Fetch full extracted text via GET /v1/documents/{id}/preview."""
    res = requests.get(
        f"{HD_BASE}/v1/documents/{doc_id}/preview",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    res.raise_for_status()
    return res.json().get("content_text", "")


def _match_diseases_from_text(text: str) -> list[str]:
    """Simple string match of KB disease names against full document text."""
    text_lower = text.lower()
    known = {d.lower(): d for d in list_diseases()}
    matched: list[str] = []
    seen: set[str] = set()
    for key, canonical in known.items():
        if key in text_lower and canonical not in seen:
            matched.append(canonical)
            seen.add(canonical)
    return matched


def upload_curriculum(file_bytes: bytes, filename: str) -> dict:
    """
    Upload curriculum PDF to HD via raw API (SDK has broken id mapping).
    Fetch extracted text via /v1/documents/{id}/preview.
    Match against KB disease names and return matched list.
    """
    api_key = os.environ.get("HD_API_KEY")
    if not api_key:
        raise EnvironmentError("HD_API_KEY is not set in environment.")

    doc_id = _upload_raw(api_key, file_bytes, filename)
    full_text = _get_preview_text(api_key, doc_id)
    diseases = _match_diseases_from_text(full_text)

    print(f"[curriculum] doc_id={doc_id} | text_len={len(full_text)} | matched {len(diseases)} diseases: {diseases}")
    return {"doc_id": doc_id, "doc_name": filename, "diseases": diseases}
