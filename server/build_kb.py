"""
build_kb.py
-----------
Build server/diseases.json from NHS condition pages via Human Delta + Groq.

Simple flow, disease by disease:
  1. If `/source/website/nhs.uk/conditions/{slug}.md` is already on HD's fs
     (from any earlier crawl), just read it. No new crawl.
  2. Otherwise, crawl just that one page (max_pages=1), wait, then read it.
  3. Strip image markdown, cap the context, send to Groq with a strict JSON
     schema. Groq fills in vitals_ranges from its own medical knowledge — NHS
     pages don't carry numeric ranges.
  4. Validate the JSON and append to diseases.json on disk (resume-safe).

Env vars
--------
    HD_API_KEY           Human Delta API key (required)
    GROQ_API_KEY         Groq API key (required)
    MAX_DISEASES         Optional cap (default 10)
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from humandelta import HumanDelta
from groq import Groq


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_HERE = Path(__file__).parent

NHS_AZ_URL       = "https://www.nhs.uk/conditions/"
FS_HOST_PREFIX   = "/source/website/nhs.uk"
AZ_FS_PATHS      = [
    f"{FS_HOST_PREFIX}/conditions.md",
    f"{FS_HOST_PREFIX}/conditions/index.md",
]
DISEASE_URL      = "https://www.nhs.uk/conditions/{slug}/"
DISEASE_FS_PATHS = [
    f"{FS_HOST_PREFIX}/conditions/{{slug}}.md",
    f"{FS_HOST_PREFIX}/conditions/{{slug}}/index.md",
]

MAX_CONTEXT_CHARS     = 6000
MIN_SEARCH_CHARS      = 400     # below this we fall back to fs.read
SEARCH_TOP_K          = 1       # 1 chunk per query (× 2 queries) — index has only 1 page
CRAWL_POLL_INTERVAL   = 3
CRAWL_TIMEOUT         = 600     # generous — HD can be slow under load
POST_CRAWL_RETRIES    = 5
POST_CRAWL_SLEEP      = 3
INTER_REQUEST_SLEEP   = 1.0
QUEUE_429_BACKOFF     = 15      # seconds to sleep after a 429 before retrying the crawl
QUEUE_429_MAX_RETRIES = 4
MAX_DISEASES_DEFAULT  = 10
AGENT_MEMORY_PATH     = "/agent/notes/clinicverse_kb_summary.md"
LLM_MODEL             = "llama-3.1-8b-instant"
OUTPUT_PATH           = _HERE / "diseases.json"

REQUIRED_KEYS       = {"name", "symptoms", "treatments", "vitals_ranges"}
REQUIRED_VITAL_KEYS = {"bp_sys", "bp_dia", "hr", "temp", "spo2", "rr", "pain"}


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a medical data extraction assistant. "
    "Return ONLY valid JSON — no preamble, no markdown, no code fences, no commentary. "
    "Follow the exact schema the user provides."
)

USER_PROMPT_TEMPLATE = """Extract structured clinical data for the disease "{disease}" from the context below.

Return ONLY valid JSON in EXACTLY this shape:

{{
  "name": "{disease}",
  "symptoms": ["symptom 1", "symptom 2", "..."],
  "treatments": ["treatment 1", "treatment 2", "..."],
  "vitals_ranges": {{
    "bp_sys":  {{"min": 100, "max": 130, "unit": "mmHg"}},
    "bp_dia":  {{"min": 60,  "max": 85,  "unit": "mmHg"}},
    "hr":      {{"min": 90,  "max": 120, "unit": "bpm"}},
    "temp":    {{"min": 38.5,"max": 40.2,"unit": "C"}},
    "spo2":    {{"min": 86,  "max": 94,  "unit": "%"}},
    "rr":      {{"min": 22,  "max": 32,  "unit": "breaths/min"}},
    "pain":    {{"min": 4,   "max": 8,   "unit": "/10"}}
  }}
}}

Rules:
- Pull symptoms and treatments directly from the context. Keep phrases short and clinical.
- Do not leave treatments empty if the context describes any.
- vitals_ranges comes from your own medical knowledge, not the context. Use clinically reasonable ranges for a patient actively presenting with "{disease}".
- All 7 vitals keys must be present, with numeric min/max (no strings).
- Use "{disease}" exactly as the name.
- Ignore any image URLs or markdown image syntax in the context.

=== CONTEXT ===
{page}
=== END CONTEXT ===
"""


# ---------------------------------------------------------------------------
# Tiny helpers
# ---------------------------------------------------------------------------


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _env(var: str) -> str:
    v = os.environ.get(var)
    if not v:
        print(f"[build_kb] ERROR: env var {var} is not set.", file=sys.stderr)
        sys.exit(1)
    return v


def _parse_json(raw: str) -> dict:
    text = raw.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    if not text.startswith("{"):
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
    return json.loads(text)


def _validate(entry: dict, disease: str) -> dict:
    missing = REQUIRED_KEYS - entry.keys()
    if missing:
        raise ValueError(f"missing top-level keys: {missing}")
    if not isinstance(entry["symptoms"], list) or not entry["symptoms"]:
        raise ValueError("symptoms must be a non-empty list")
    if not isinstance(entry["treatments"], list):
        raise ValueError("treatments must be a list")
    vitals = entry["vitals_ranges"]
    if not isinstance(vitals, dict):
        raise ValueError("vitals_ranges must be an object")
    missing_v = REQUIRED_VITAL_KEYS - vitals.keys()
    if missing_v:
        raise ValueError(f"vitals_ranges missing keys: {missing_v}")
    for k, v in vitals.items():
        if not isinstance(v, dict):
            raise ValueError(f"vitals_ranges.{k} must be an object")
        for need in ("min", "max", "unit"):
            if need not in v:
                raise ValueError(f"vitals_ranges.{k}.{need} missing")
        if not isinstance(v["min"], (int, float)) or not isinstance(v["max"], (int, float)):
            raise ValueError(f"vitals_ranges.{k}.min/max must be numeric")
    entry["name"] = disease
    return entry


# Strip markdown images like ![alt](url) — never send those to the LLM.
_IMG_RE = re.compile(r"!\[[^\]]*\]\([^)]+\)")


def _strip_images(text: str) -> str:
    text = _IMG_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# ---------------------------------------------------------------------------
# HD Agent memory
# ---------------------------------------------------------------------------

def read_agent_memory(hd: HumanDelta) -> str:
    """Read the last build summary from HD agent memory, if it exists."""
    try:
        content = hd.fs.read(AGENT_MEMORY_PATH)
        if content and len(content) > 10:
            print(f"[build_kb] Agent memory found:\n{content.strip()}")
            return content
    except Exception:
        pass
    print("[build_kb] No prior agent memory found — fresh start.")
    return ""


def write_agent_memory(hd: HumanDelta, total: int, ok: int, fail: int,
                       via_search: int, via_fs_read: int, diseases: list[str]) -> None:
    """Write a build summary to HD agent memory for future runs."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    disease_list = "\n".join(f"- {d}" for d in sorted(diseases))
    content = f"""# KB Build Summary

**Last run:** {now}
**Total diseases in KB:** {total}
**This run:** {ok} added, {fail} failed
**Context source:** {via_search} via HD semantic search, {via_fs_read} via fs.read

## Diseases indexed
{disease_list}
"""
    try:
        hd.fs.write(AGENT_MEMORY_PATH, content)
        print(f"[build_kb] Agent memory written to {AGENT_MEMORY_PATH}")
    except Exception as e:
        print(f"[build_kb] Could not write agent memory: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# A-Z parsing
# ---------------------------------------------------------------------------

_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
_ALIAS_RE   = re.compile(r",\s*see\s+", re.IGNORECASE)


def _slug_from_url(url: str) -> str:
    parts = urlparse(url).path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "conditions" and parts[1]:
        return parts[1]
    return ""


def parse_disease_entries(text: str) -> list[tuple[str, str]]:
    """Return [(display_name, slug)] from the NHS A-Z markdown, in page order."""
    seen: dict[str, str] = {}
    for m in _MD_LINK_RE.finditer(text):
        name, url = m.group(1).strip(), m.group(2).strip()
        if _ALIAS_RE.search(name):
            continue
        slug = _slug_from_url(url)
        if slug and slug not in seen:
            seen[slug] = name
    return [(seen[s], s) for s in seen]


# ---------------------------------------------------------------------------
# HD I/O
# ---------------------------------------------------------------------------


def _fs_read_first(hd: HumanDelta, paths: list[str]) -> str:
    """Try each path; return first non-empty content (len > 300), else ''."""
    for p in paths:
        try:
            content = hd.fs.read(p)
        except Exception:
            continue
        if isinstance(content, str) and len(content) > 300:
            return content
    return ""


def fetch_az_text(hd: HumanDelta) -> str:
    """Read the NHS A-Z page from fs; crawl it (max_pages=1) if missing."""
    text = _fs_read_first(hd, AZ_FS_PATHS)
    if text:
        print(f"[build_kb] A-Z page already on fs ({len(text)} chars)")
        return text

    print(f"[build_kb] A-Z missing — crawling {NHS_AZ_URL}")
    t0 = time.time()
    job = hd.indexes.create(NHS_AZ_URL, max_pages=1, name="NHS A-Z")
    job.wait(interval=CRAWL_POLL_INTERVAL, timeout=CRAWL_TIMEOUT)
    if job.status != "completed":
        raise RuntimeError(f"A-Z crawl did not complete (status={job.status})")
    print(f"[build_kb]   crawl done in {time.time() - t0:.1f}s")

    for _ in range(POST_CRAWL_RETRIES):
        text = _fs_read_first(hd, AZ_FS_PATHS)
        if text:
            return text
        time.sleep(POST_CRAWL_SLEEP)
    raise RuntimeError("A-Z page missing from fs after crawl")


def _search_disease_chunks(hd: HumanDelta, index_id: str, name: str) -> str:
    """
    Run two targeted vector searches scoped to ``index_id`` and return the
    concatenated chunk text (deduped by chunk_id, images stripped).

    We bypass ``hd.search()`` because the installed SDK drops the ``index_id``
    and ``sources`` kwargs. Posting to ``/v1/search`` directly keeps scoping.
    """
    queries  = [f"symptoms of {name}", f"treatment for {name}"]
    seen_ids: set[str] = set()
    parts:    list[str] = []

    for q in queries:
        try:
            raw = hd._post("/v1/search", {
                "query":    q,
                "top_k":    SEARCH_TOP_K,
                "index_id": index_id,
                "sources":  ["web"],
            })
        except Exception as e:
            print(f"[build_kb]   search({q!r}) raised {type(e).__name__}: {e}")
            continue

        items = raw if isinstance(raw, list) else (raw.get("results") or raw.get("data") or [])
        for r in items:
            if not isinstance(r, dict):
                continue
            text = r.get("text") or ""
            cid  = r.get("chunk_id")
            if not text or (cid and cid in seen_ids):
                continue
            if cid:
                seen_ids.add(cid)
            cleaned = _strip_images(text).strip()
            if cleaned:
                parts.append(cleaned)

    return "\n\n".join(parts)


def fetch_disease_context(hd: HumanDelta, slug: str, name: str) -> tuple[str, str]:
    """
    Return ``(context_text, source_tag)`` for one disease.

    Flow:
      1. If ``slug.md`` is on fs → return it (``fs.read``). No crawl.
      2. Else fire a ``max_pages=1`` crawl and wait (with a 429 retry loop).
         Once done, run a targeted search on the fresh index (``search``).
      3. If search returns too little, fall back to reading the freshly
         written page from fs.
    """
    paths = [p.format(slug=slug) for p in DISEASE_FS_PATHS]

    # (1) fs hit — no crawl, no search.
    stored = _fs_read_first(hd, paths)
    if stored:
        print(f"[build_kb]   fs hit — {len(stored)} chars (no crawl)")
        return stored, "fs.read"

    # (2) Crawl. Retry with backoff on 429.
    url = DISEASE_URL.format(slug=slug)
    print(f"[build_kb]   fs miss — crawling {url}")
    job = None
    for attempt in range(QUEUE_429_MAX_RETRIES + 1):
        try:
            job = hd.indexes.create(url, max_pages=1, name=f"NHS: {slug}")
            break
        except Exception as e:
            if "429" in str(e) and attempt < QUEUE_429_MAX_RETRIES:
                wait = QUEUE_429_BACKOFF * (attempt + 1)
                print(f"[build_kb]   [429] waiting {wait}s (attempt {attempt + 1}/{QUEUE_429_MAX_RETRIES})")
                time.sleep(wait)
                continue
            raise

    t0 = time.time()
    try:
        job.wait(interval=CRAWL_POLL_INTERVAL, timeout=CRAWL_TIMEOUT)
    except TimeoutError:
        try:
            job.cancel()
        except Exception:
            pass
        raise
    if job.status != "completed":
        raise RuntimeError(f"crawl status={job.status}")
    print(f"[build_kb]   crawl done in {time.time() - t0:.1f}s")

    # (2a) Preferred: targeted search against the fresh single-page index.
    chunks = _search_disease_chunks(hd, job.id, name)
    if len(chunks) >= MIN_SEARCH_CHARS:
        print(f"[build_kb]   search ok — {len(chunks)} chars of chunks")
        return chunks, "search"
    print(f"[build_kb]   search short ({len(chunks)} chars) — falling back to fs.read")

    # (2b) Fallback: read the newly stored markdown.
    for _ in range(POST_CRAWL_RETRIES):
        stored = _fs_read_first(hd, paths)
        if stored:
            return stored, "fs.read"
        time.sleep(POST_CRAWL_SLEEP)
    raise RuntimeError("page missing from fs after crawl")


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def extract_entry(llm: Groq, disease: str, page_text: str) -> dict:
    context = _strip_images(page_text)[:MAX_CONTEXT_CHARS]
    prompt = USER_PROMPT_TEMPLATE.format(disease=disease, page=context)
    completion = llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": prompt},
        ],
        temperature=0.1,
        max_tokens=800,
    )
    raw = completion.choices[0].message.content or ""
    return _validate(_parse_json(raw), disease)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    _load_dotenv(_HERE / ".env")
    hd  = HumanDelta(api_key=_env("HD_API_KEY"))
    llm = Groq(api_key=_env("GROQ_API_KEY"))

    try:
        max_n = int(os.environ.get("MAX_DISEASES", MAX_DISEASES_DEFAULT))
    except ValueError:
        max_n = MAX_DISEASES_DEFAULT
    print(f"[build_kb] MAX_DISEASES={max_n}")

    read_agent_memory(hd)

    az = fetch_az_text(hd)
    entries = parse_disease_entries(az)
    print(f"[build_kb] parsed {len(entries)} diseases from A-Z")
    if not entries:
        sys.exit(2)
    entries = entries[:max_n]

    # Resume: skip diseases already in diseases.json
    results: list[dict] = []
    done: set[str] = set()
    if OUTPUT_PATH.exists():
        try:
            existing = json.loads(OUTPUT_PATH.read_text())
            if isinstance(existing, list):
                results = existing
                done = {e.get("name", "") for e in results if isinstance(e, dict)}
                print(f"[build_kb] loaded {len(results)} existing entries")
        except Exception as e:
            print(f"[build_kb] could not read existing {OUTPUT_PATH.name}: {e}")

    remaining = [(n, s) for n, s in entries if n not in done]
    skipped   = len(entries) - len(remaining)
    print(f"[build_kb] {len(remaining)} to process ({skipped} already done)")

    ok = fail = 0
    via_search = via_fs_read = 0
    for i, (name, slug) in enumerate(remaining, start=1):
        print(f"\n[build_kb] ({i}/{len(remaining)}) {name}  (slug={slug})")
        try:
            page, source = fetch_disease_context(hd, slug, name)
            if source == "search":
                via_search += 1
            else:
                via_fs_read += 1
            entry = extract_entry(llm, name, page)
            results.append(entry)
            OUTPUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
            ok += 1
            tag = "[via SEARCH]" if source == "search" else "[via fs.read]"
            print(f"[build_kb]   ok {tag} — {len(entry['symptoms'])} symptoms, "
                  f"{len(entry['treatments'])} treatments  [saved]")
        except Exception as e:
            fail += 1
            print(f"[build_kb]   SKIPPED ({type(e).__name__}): {e}", file=sys.stderr)
        time.sleep(INTER_REQUEST_SLEEP)

    OUTPUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(
        f"\n[build_kb] done. {ok} ok, {fail} failed. "
        f"context: {via_search} via SEARCH, {via_fs_read} via fs.read. "
        f"total entries: {len(results)}"
    )

    all_disease_names = [e["name"] for e in results if isinstance(e, dict) and "name" in e]
    write_agent_memory(hd, len(results), ok, fail, via_search, via_fs_read, all_disease_names)


if __name__ == "__main__":
    main()
