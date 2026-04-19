"""
build_kb.py
-----------
Build server/diseases.json from NHS condition pages via Human Delta.

Flow
----
0. Crawl (or reuse) the NHS A-Z page at https://www.nhs.uk/conditions/ with
   max_pages=1 — HD stores just that one page on its virtual filesystem.
1. hd.fs.read() the A-Z page and parse every `- [Name](url)` markdown link
   to produce (display_name, slug) pairs. Aliases ("X, see Y") are skipped.
2. For each of the first MAX_DISEASES entries:
     a. hd.indexes.create(disease_url, max_pages=1)  — crawl JUST that page,
        no sub-link following.
     b. job.wait() until completed.
     c. hd.fs.read("/source/website/nhs.uk/conditions/{slug}.md") returns
        the full single-page text (Symptoms + Tests + Treatment + Causes
        are all inline on the NHS page).
     d. Send that text to Groq (llama-3.3-70b-versatile) with a
        strict JSON schema; validate; append to diseases.json.

Env vars
--------
    HD_API_KEY           Human Delta API key (required)
    GROQ_API_KEY         Groq API key (required, used for JSON extraction)
    MAX_DISEASES         Optional cap on diseases to process (default 10)
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from humandelta import HumanDelta
from groq import Groq


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

_HERE = Path(__file__).parent

NHS_AZ_URL           = "https://www.nhs.uk/conditions/"
AZ_FS_PATHS          = [
    "/source/website/nhs.uk/conditions.md",
    "/source/website/nhs.uk/conditions/index.md",
    "/source/website/nhs.uk/conditions",
    "/source/website/nhs.uk/conditions/",
]
DISEASE_PAGE_URL     = "https://www.nhs.uk/conditions/{slug}/"
DISEASE_FS_PATHS     = [
    "/source/website/nhs.uk/conditions/{slug}.md",
    "/source/website/nhs.uk/conditions/{slug}/index.md",
    "/source/website/nhs.uk/conditions/{slug}",
    "/source/website/nhs.uk/conditions/{slug}/",
]
FS_HOST_PREFIX       = "/source/website/nhs.uk"

MAX_PAGE_CHAR_LIMIT  = 40000
LLM_MODEL            = "llama-3.3-70b-versatile"
OUTPUT_PATH          = _HERE / "diseases.json"

CRAWL_POLL_INTERVAL  = 3
CRAWL_TIMEOUT        = 300
POST_CRAWL_RETRIES   = 5      # retry fs.read after job completes
POST_CRAWL_SLEEP     = 3      # seconds between retries
INTER_REQUEST_SLEEP  = 1.0
MAX_DISEASES_DEFAULT = 10

REQUIRED_KEYS        = {"name", "symptoms", "treatments", "vitals_ranges"}
REQUIRED_VITAL_KEYS  = {"bp_sys", "bp_dia", "hr", "temp", "spo2", "rr", "pain"}


# ---------------------------------------------------------------------------
# Extraction prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a medical data extraction assistant. "
    "Return ONLY valid JSON — no preamble, no markdown, no code fences, "
    "no commentary. Follow the exact schema the user provides."
)

USER_PROMPT_TEMPLATE = """Extract structured clinical data for the disease "{disease}" from the NHS page below.

Return ONLY valid JSON in EXACTLY this shape (no markdown, no code fences, no extra keys):

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
- Populate symptoms from the page's Symptoms section.
- Populate treatments from the page's Treatment section (often titled "Treatment for {disease}" or similar). Do not leave treatments empty if the page describes any treatment.
- Prefer concise clinical phrases; avoid full sentences.
- If the page lacks enough info for a vital, use clinically reasonable defaults for "{disease}".
- All vitals_ranges keys MUST be present. Numeric min/max only (no strings).
- Use "{disease}" exactly as the name. Do not rename the disease.

=== NHS PAGE ===
{page}
=== END PAGE ===
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _load_dotenv(path: Path) -> None:
    """Populate os.environ from a simple KEY=VALUE .env file if present."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


def _env(var: str) -> str:
    val = os.environ.get(var)
    if not val:
        print(f"[build_kb] ERROR: env var {var} is not set.", file=sys.stderr)
        sys.exit(1)
    return val


def _parse_json(raw: str) -> dict:
    """Strip code fences / preamble and return parsed JSON dict."""
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
    missing_vitals = REQUIRED_VITAL_KEYS - vitals.keys()
    if missing_vitals:
        raise ValueError(f"vitals_ranges missing keys: {missing_vitals}")
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


# ---------------------------------------------------------------------------
# Disease-list parsing (from the NHS A-Z page markdown)
# ---------------------------------------------------------------------------

_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\((https?://[^)]+)\)")
_ALIAS_RE   = re.compile(r",\s*see\s+", re.IGNORECASE)


def _slug_from_url(url: str) -> str:
    """Return the disease slug from an NHS /conditions/<slug>/ URL, or ''."""
    path = urlparse(url).path.strip("/")
    parts = path.split("/")
    if len(parts) >= 2 and parts[0] == "conditions" and parts[1]:
        return parts[1]
    return ""


def parse_disease_entries(text: str) -> list[tuple[str, str]]:
    """
    Parse the A-Z markdown and return [(display_name, slug)] in page order.

    NHS renders each condition as `- [Name](https://www.nhs.uk/conditions/slug/)`.
    Alias rows like `- [Acid reflux, see Heartburn and acid reflux](...)` are
    skipped. Non-`/conditions/<slug>/` URLs (nav, breadcrumbs, fragments) are
    skipped because _slug_from_url returns "".
    """
    seen: dict[str, str] = {}  # slug -> display_name (preserves insertion order)
    for m in _MD_LINK_RE.finditer(text):
        name = m.group(1).strip()
        url  = m.group(2).strip()
        if _ALIAS_RE.search(name):
            continue
        slug = _slug_from_url(url)
        if not slug:
            continue
        if slug not in seen:
            seen[slug] = name
    return [(seen[s], s) for s in seen]


# ---------------------------------------------------------------------------
# HD helpers
# ---------------------------------------------------------------------------


def _fs_read_first(hd: HumanDelta, paths: list[str]) -> str:
    """Try each fs path; return the first non-empty content or ''."""
    for p in paths:
        try:
            content = hd.fs.read(p)
        except Exception:
            continue
        if isinstance(content, str) and len(content) > 300:
            return content
    return ""


def _shell(hd: HumanDelta, cmd: str) -> str:
    """Run hd.fs.shell and return stdout as a string (empty on failure)."""
    try:
        out = hd.fs.shell(cmd)
    except Exception as e:
        print(f"[build_kb]   shell({cmd!r}) raised {type(e).__name__}: {e}")
        return ""
    if isinstance(out, str):
        return out
    # Some SDK versions may return a dict-like {'stdout': ...}
    return getattr(out, "stdout", None) or (out.get("stdout", "") if hasattr(out, "get") else "")


def _find_first_file(hd: HumanDelta, prefix: str) -> str:
    """Return the first file path under prefix, or '' if none."""
    out = _shell(hd, f"find {prefix} -type f 2>/dev/null | head -10")
    for line in out.splitlines():
        line = line.strip()
        if line:
            return line
    return ""


def _dump_tree(hd: HumanDelta, prefix: str) -> None:
    """Print a short diagnostic of what's stored under prefix."""
    print(f"[build_kb]   diagnostic: files under {prefix}:")
    out = _shell(hd, f"find {prefix} -type f 2>/dev/null | head -20")
    print(out if out else "    (nothing found)")


def fetch_az_index(hd: HumanDelta) -> str:
    """Return the NHS A-Z page text. Crawl it (max_pages=1) if not already stored."""
    text = _fs_read_first(hd, AZ_FS_PATHS)
    if text:
        print(f"[build_kb] A-Z page already in HD fs ({len(text)} chars)")
        return text

    print(f"[build_kb] Crawling A-Z page: {NHS_AZ_URL}")
    job = hd.indexes.create(NHS_AZ_URL, max_pages=1, name="NHS A-Z")
    print(f"[build_kb]   index_id={job.id}  status={job.status}")
    job.wait(interval=CRAWL_POLL_INTERVAL, timeout=CRAWL_TIMEOUT)
    if job.status != "completed":
        raise RuntimeError(f"A-Z crawl did not complete (status={job.status})")

    # Retry fs.read + find a few times — HD sometimes needs a few seconds
    # after job.wait() returns before the stored file is visible.
    for attempt in range(1, POST_CRAWL_RETRIES + 1):
        text = _fs_read_first(hd, AZ_FS_PATHS)
        if text:
            print(f"[build_kb]   got A-Z page ({len(text)} chars)")
            return text

        out = _shell(
            hd,
            f"find {FS_HOST_PREFIX} -maxdepth 2 -name 'conditions*' -type f 2>/dev/null | head -5",
        )
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                content = hd.fs.read(line)
                if isinstance(content, str) and len(content) > 300:
                    print(f"[build_kb]   read {len(content)} chars from {line}")
                    return content
            except Exception as e:
                print(f"[build_kb]   fs.read({line}) failed: {e}")

        print(f"[build_kb]   fs not ready (attempt {attempt}/{POST_CRAWL_RETRIES}), sleeping {POST_CRAWL_SLEEP}s …")
        time.sleep(POST_CRAWL_SLEEP)

    _dump_tree(hd, FS_HOST_PREFIX)
    raise RuntimeError("A-Z page missing from fs after crawl")


def fetch_disease_page(hd: HumanDelta, slug: str) -> str:
    """
    Crawl a single NHS disease page (max_pages=1) and return its text.

    If the page is already on the fs from a prior run, skip the crawl and
    return the stored text.
    """
    paths = [p.format(slug=slug) for p in DISEASE_FS_PATHS]

    text = _fs_read_first(hd, paths)
    if text:
        print(f"[build_kb]   reusing stored page ({len(text)} chars)")
        return text

    url = DISEASE_PAGE_URL.format(slug=slug)
    job = hd.indexes.create(url, max_pages=1, name=f"NHS: {slug}")
    print(f"[build_kb]   crawl queued: index_id={job.id}")
    job.wait(interval=CRAWL_POLL_INTERVAL, timeout=CRAWL_TIMEOUT)
    if job.status != "completed":
        raise RuntimeError(f"crawl did not complete (status={job.status})")

    # Retry fs.read + find a few times — see comment in fetch_az_index.
    for attempt in range(1, POST_CRAWL_RETRIES + 1):
        text = _fs_read_first(hd, paths)
        if text:
            return text

        out = _shell(
            hd,
            f"find {FS_HOST_PREFIX}/conditions -maxdepth 2 -name '{slug}*' -type f 2>/dev/null | head -5",
        )
        for line in out.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                content = hd.fs.read(line)
                if isinstance(content, str) and len(content) > 300:
                    print(f"[build_kb]   found stored file at: {line}")
                    return content
            except Exception as e:
                print(f"[build_kb]   fs.read({line}) failed: {e}")

        print(f"[build_kb]   fs not ready (attempt {attempt}/{POST_CRAWL_RETRIES}), sleeping {POST_CRAWL_SLEEP}s …")
        time.sleep(POST_CRAWL_SLEEP)

    _dump_tree(hd, f"{FS_HOST_PREFIX}/conditions")
    raise RuntimeError("page missing from fs after crawl")


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def extract_entry(llm: Groq, disease: str, page_text: str) -> dict:
    page = page_text[:MAX_PAGE_CHAR_LIMIT]
    user_prompt = USER_PROMPT_TEMPLATE.format(disease=disease, page=page)

    completion = llm.chat.completions.create(
        model=LLM_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user",   "content": user_prompt},
        ],
        temperature=0.1,
        max_tokens=800,
    )
    raw = completion.choices[0].message.content or ""
    parsed = _parse_json(raw)
    return _validate(parsed, disease)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    _load_dotenv(_HERE / ".env")
    hd_key   = _env("HD_API_KEY")
    groq_key = _env("GROQ_API_KEY")

    hd  = HumanDelta(api_key=hd_key)
    llm = Groq(api_key=groq_key)

    try:
        max_n = int(os.environ.get("MAX_DISEASES", MAX_DISEASES_DEFAULT))
    except ValueError:
        max_n = MAX_DISEASES_DEFAULT
    print(f"[build_kb] MAX_DISEASES={max_n}")

    az_text = fetch_az_index(hd)
    entries = parse_disease_entries(az_text)
    print(f"[build_kb] Parsed {len(entries)} (name, slug) pairs from the A-Z page")
    if not entries:
        print("[build_kb] No diseases parsed — aborting.", file=sys.stderr)
        sys.exit(2)

    entries = entries[:max_n]

    # Resume support: load any existing diseases.json and skip entries whose
    # display name is already in it. Ensures partial runs can be continued.
    results: list[dict] = []
    done_names: set[str] = set()
    if OUTPUT_PATH.exists():
        try:
            existing = json.loads(OUTPUT_PATH.read_text())
            if isinstance(existing, list):
                results = existing
                done_names = {e.get("name", "") for e in results if isinstance(e, dict)}
                print(f"[build_kb] Loaded {len(results)} existing entries from {OUTPUT_PATH.name}")
        except Exception as e:
            print(f"[build_kb] Could not read existing {OUTPUT_PATH.name}: {e}")

    remaining = [(n, s) for n, s in entries if n not in done_names]
    skipped   = len(entries) - len(remaining)
    print(f"[build_kb] Processing {len(remaining)} diseases "
          f"({skipped} already done, skipping):")
    for name, slug in remaining:
        print(f"[build_kb]   - {name}  →  {slug}")

    succeeded = 0
    failed    = 0

    for i, (name, slug) in enumerate(remaining, start=1):
        print(f"\n[build_kb] ({i}/{len(remaining)}) {name}  (slug={slug})")
        try:
            page = fetch_disease_page(hd, slug)
            print(f"[build_kb]   fetched page ({len(page)} chars)")
            entry = extract_entry(llm, name, page)
            results.append(entry)
            succeeded += 1
            OUTPUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
            print(
                f"[build_kb]   ok — {len(entry['symptoms'])} symptoms, "
                f"{len(entry['treatments'])} treatments  [saved {OUTPUT_PATH.name}]"
            )
        except Exception as e:
            failed += 1
            print(f"[build_kb]   SKIPPED ({type(e).__name__}): {e}", file=sys.stderr)
        time.sleep(INTER_REQUEST_SLEEP)

    OUTPUT_PATH.write_text(json.dumps(results, indent=2, ensure_ascii=False))
    print(
        f"\n[build_kb] Done. {succeeded} succeeded, {failed} failed. "
        f"Wrote {len(results)} entries to {OUTPUT_PATH}"
    )


if __name__ == "__main__":
    main()
