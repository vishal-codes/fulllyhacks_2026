# Backend — AI Medical Patient Simulator

## Project overview
This is the FastAPI backend for a medical education simulation app. A teacher doctor sets up a virtual patient by selecting a disease and optionally editing the default symptoms and vitals ranges. A student doctor then has a text conversation with that virtual patient to practise diagnosis. At the end the system evaluates the student's performance and returns an OSCE-style report scored out of 100.

The backend is purely a text processing system. All speech-to-text and text-to-speech happens on the frontend. The backend only ever handles plain text in and plain text out. Never deal with audio, binary, or speech data anywhere in this codebase.

---

## Codebase state
Only two things are complete and must never be modified:
- `notebooks/` — fine-tuning work, done
- `qwen-patient-adapter/` — fine-tuned Qwen 2.5-1.5B LoRA adapter weights, done

The knowledge base file `diseases.json` is committed and populated (50 NHS conditions). It is the runtime source of truth. It can be regenerated or extended by re-running `build_kb.py` (offline), but the running app only ever reads the file.

Everything else is in active development. Read each file before working on it.

---

## Project structure
```
server/
  notebooks/              # done — never touch
  qwen-patient-adapter/   # done — never touch
  app.py                  # FastAPI app, route registration, CORS, lifespan
  model.py                # Qwen model + LoRA adapter loading and raw inference
  session.py              # single global session state, DiseaseEngine, prompt builders
  report.py               # OSCE evaluation via Groq llama-3.3-70b-versatile
  knowledge_base.py       # disease KB (reads diseases.json), RAG retrieval, synthetic patient generation
  build_kb.py             # offline builder — crawls NHS via Human Delta, extracts JSON via Groq
  diseases.json           # runtime KB — 50 NHS conditions with symptoms, treatments, vitals_ranges
  humandeltadocs.pdf      # reference docs for the Human Delta SDK (used only by build_kb.py)
  main.py                 # tiny scratch entry point — prints a random synthea_patient()
  chat.py                 # legacy — superseded by session.py, ignore
  inference.py            # legacy — superseded by model.py + session.py, ignore
  legacy_knowledge_base.py# legacy — superseded by knowledge_base.py + diseases.json, ignore
  pyproject.toml          # uv project manifest, dependencies declared here
  uv.lock
  requirements.txt        # older pip-style list kept for reference — prefer pyproject.toml
  tests/
  .env                    # GROQ_API_KEY, HD_API_KEY (not committed)
```

Use `uv` to manage packages. Never use `pip` directly.

---

## Environment variables
- `GROQ_API_KEY` — required at runtime (OSCE evaluation in `report.py`) and for `build_kb.py`
- `HD_API_KEY` — required only for `build_kb.py` (Human Delta crawler). Not touched at runtime.
- `HOST`, `PORT`, `RELOAD` — optional uvicorn overrides for `uv run app.py`
- `MAX_DISEASES` — optional cap for `build_kb.py` (default 10)

Both keys can live in `server/.env` — `build_kb.py` reads it directly; `app.py` expects them to already be in the environment.

---

## Core concepts

### Single global session
There is only ever one active session at a time. No session IDs, no multi-user support, no database. The entire session state lives in the `GlobalSession` singleton in `session.py`. Starting a new session resets it completely.

### Teacher is the decision maker
The knowledge base provides disease defaults (symptoms, vitals ranges). These are starting points only. The teacher reviews them on the setup page and can edit any symptom or vital range before starting. Whatever the teacher submits is the ground truth for that session. The backend never overrides teacher input with KB defaults.

### Patient reveals symptoms conditionally
The virtual patient knows all the symptoms for the disease but never volunteers them unprompted. The patient only reveals a symptom when the student asks a question that naturally leads to it. The RAG retrieval in `knowledge_base.py` supports this by finding which canonical symptoms are most relevant to each question the student asks, and injecting them into the system prompt as grounding context for that turn.

### Evaluator infers the diagnosis
When the session ends, the Groq LLM evaluator reads the full conversation history and determines what diagnosis the student arrived at from the conversation itself. The student does not explicitly submit a diagnosis field — the evaluator figures it out from what was said.

### Report is OSCE-style
The evaluator scores the student across four domains (0–25 each, total 100):
1. **History Taking** — systematic symptom and background questioning
2. **Clinical Reasoning** — diagnostic logic, differentials, investigations
3. **Communication** — language clarity, empathy, structure, flow
4. **Final Diagnosis** — inferred from conversation, compared to ground truth

Each domain returns a score, what was done well, what was missed, and a brief examiner comment. The report also includes an overall `what_student_did_well` list, `what_student_missed` list, and an `examiner_note`. The report is always returned as structured JSON so the frontend can render it directly.

---

## Application flow

### Teacher setup phase
1. Teacher opens the app and sees the setup screen
2. Teacher selects a disease from the dropdown (`GET /diseases`)
3. Frontend fetches default symptoms and vitals ranges (`GET /diseases/{name}`)
4. Teacher reviews defaults and edits anything they disagree with
5. Teacher hits Start Session — frontend sends disease, symptoms, and (optionally) exact vitals values to `POST /session/new`
6. Backend generates a synthetic patient (random name, age, gender, backstory, vitals taken from the teacher-set values or sampled from the disease's ranges for any key the teacher didn't set) and stores everything in the global session
7. Backend returns only: patient name, age, gender, disease, and vitals — teacher sees the profile and hands the device to the student

### Student conversation phase
1. Student speaks — frontend converts speech to text and sends it to `POST /session/chat`
2. Backend retrieves relevant symptoms via RAG for the student's question, rebuilds the patient system prompt with current RAG context and symptom log, runs Qwen inference, returns the patient's text reply
3. Frontend converts reply to speech and plays it back
4. Every turn is appended to conversation history in the global session
5. Student concludes when they feel they have enough information

### Session end and report phase
1. Student indicates they are done — frontend calls `POST /session/end` with no body
2. Backend passes the full conversation history, correct disease, patient vitals, and canonical symptoms to the OSCE evaluator prompt
3. Groq llama-3.3-70b-versatile reads the conversation, infers the student's diagnosis, scores all four OSCE domains, and returns structured JSON
4. Backend recomputes `total_score` from the four domain scores (guards against LLM miscalculation) and returns the report to the frontend
5. Frontend renders the OSCE report page

---

## Component responsibilities

### app.py
Owns the FastAPI app instance, route registration, CORS middleware (allows `http://localhost:3000` for the Next.js dev server), and the lifespan handler that calls `model.load()` at startup. Route handlers are thin — they delegate to `session.py` and `report.py`. No business logic lives here.

### model.py
Owns model loading and raw inference only. Loads the base Qwen 2.5-1.5B model and the LoRA adapter from `qwen-patient-adapter/` once at startup. Chooses device automatically: MPS on Apple Silicon, otherwise CPU (no bitsandbytes). Exposes `load()` (called once) and `generate_patient_response(history, patient, max_new_tokens)` which returns a plain string. Includes a post-generation identity guard to fix name/age hallucinations. No prompt logic lives here.

### session.py
Owns all conversation logic. Contains:
- `DiseaseEngine` — tracks which canonical symptoms have been mentioned across turns
- Prompt builders (`_make_system_msg`, `_make_seed_turns`) — all prompt templates are module-level string constants here
- `GlobalSession` — the singleton that holds patient, history, symptom log, and DiseaseEngine; exposes `reset(patient)`, `chat(message)`, `get_transcript()`, `symptom_coverage()`
- History layout: `[0]` system message (rebuilt each turn), `[1..4]` two seeded few-shot turn pairs, `[5+]` real doctor/patient exchanges. `_HISTORY_OFFSET = 5` is used by `get_transcript()` to skip the scaffolding.
- `get_session()` — module-level accessor used by `app.py`

### report.py
Owns OSCE evaluation. Builds the evaluation prompt, calls Groq (`llama-3.3-70b-versatile`, temperature 0.1, max_tokens 2000), parses the JSON response, recomputes the total score, and returns the full report dict (merging `osce_report` with patient/vitals/transcript/symptom-coverage metadata). The `_OSCE_PROMPT` template is a module-level constant. No route logic lives here.

### knowledge_base.py
Owns all disease data and patient generation. Loads `diseases.json` at import time into four module-level indexes: `SYMPTOM_KB`, `TREATMENT_KB`, `VITALS_RANGES_KB`, and `DISEASE_INDEX` (lowercased → canonical name for case-insensitive lookup). Any disease missing a vitals key is filled in from `_NORMAL_VITALS`. If `diseases.json` is missing or malformed the indexes stay empty and `synthea_patient()` will refuse to run.

Key public functions that must always exist:
- `list_diseases()` → sorted list of disease name strings
- `disease_info(name)` → dict with `disease`, `symptoms`, `treatments`, `vitals_ranges` (case-insensitive match)
- `disease_vitals_ranges(disease)` → dict of `{key: {min, max, unit}}`, falling back to normal vitals
- `rag_retrieve(disease, question)` → top 3–5 canonical symptoms most relevant to the question
- `synthea_patient()` → fully random synthetic patient dict drawn from the KB
- `synthea_patient_from_spec(disease, symptoms, vitals)` → patient from teacher spec. `vitals` is a **flat dict of exact values** (`{"hr": 110, "temp": 39.2, ...}`), not a ranges dict — any key omitted is sampled from the disease's default range.
- `generate_doctor_questions(patient, n_symptom_qs=3)` → personalised question list (currently unused by the API surface but kept for reference/testing)

### build_kb.py (offline only)
Builds `diseases.json` by crawling the NHS A-Z (`https://www.nhs.uk/conditions/`) via the Human Delta SDK, then sending each condition page to Groq with a strict JSON schema to extract symptoms, treatments, and vitals ranges. Supports resume — reads any existing `diseases.json` and skips entries already processed. Run via `uv run build_kb.py` with `HD_API_KEY` and `GROQ_API_KEY` set; control scope via `MAX_DISEASES`. **This script is never imported or called by the running app.**

---

## OSCE report JSON schema

The `osce_report` key in the response from `POST /session/end` always matches this shape:

```json
{
  "osce_report": {
    "domains": {
      "history_taking": {
        "score": 20,
        "max": 25,
        "what_was_done_well": ["covered onset and duration", "asked about aggravating factors"],
        "what_was_missed": ["did not ask about family history", "no social history"],
        "feedback": "Good systematic approach to the presenting complaint..."
      },
      "clinical_reasoning": {
        "score": 18,
        "max": 25,
        "what_was_done_well": ["..."],
        "what_was_missed": ["..."],
        "feedback": "..."
      },
      "communication": {
        "score": 22,
        "max": 25,
        "what_was_done_well": ["..."],
        "what_was_missed": ["..."],
        "feedback": "..."
      },
      "final_diagnosis": {
        "score": 25,
        "max": 25,
        "inferred_diagnosis": "Pneumonia",
        "correct_diagnosis": "Pneumonia",
        "is_correct": true,
        "what_was_done_well": ["..."],
        "what_was_missed": ["..."],
        "feedback": "..."
      }
    },
    "total_score": 85,
    "max_score": 100,
    "what_student_did_well": ["..."],
    "what_student_missed": ["..."],
    "examiner_note": "Overall a competent consultation..."
  }
}
```

`POST /session/end` returns this `osce_report` merged with top-level `patient`, `vitals`, `transcript`, and `symptoms` (canonical vs revealed coverage) keys.

---

## API routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server status and whether a session is active |
| `GET` | `/diseases` | Sorted list of all disease names |
| `GET` | `/diseases/{name}` | Symptoms, treatments, and vitals ranges for a disease (case-insensitive) |
| `POST` | `/session/new` | Create patient from teacher spec (or fully random if body omitted); reset global session |
| `POST` | `/session/chat` | Student sends a message; returns patient response text |
| `POST` | `/session/end` | End session; returns full OSCE report JSON |

`POST /session/new` body (all fields optional):
```json
{
  "disease": "Pneumonia",
  "symptoms": ["productive cough", "fever"],
  "vitals":   {"hr": 110, "temp": 39.2, "spo2": 92}
}
```
Vitals are exact values, not ranges. Any omitted key is sampled from the disease's default range.

---

## Vitals schema
The seven required vital keys used everywhere (`_REQUIRED_VITAL_KEYS`):
`bp_sys`, `bp_dia`, `hr`, `temp`, `spo2`, `rr`, `pain`.

Each range entry has `{min, max, unit}`. `temp` is the only float; the others are integers when sampled.

---

## Hard rules
- Single session only — no session IDs, no per-request state
- Teacher input is always the source of truth — never override it with KB defaults
- Model loads once at startup via `model.load()` in the lifespan handler — never per request
- Conversation history is never truncated
- Route handlers are thin — all logic lives in `model.py`, `session.py`, `report.py`, `knowledge_base.py`
- Never touch `notebooks/` or `qwen-patient-adapter/`
- Never handle audio or binary data
- The running app only reads `diseases.json` — it never calls Human Delta. KB edits happen offline via `build_kb.py`.
- Use `uv`, not `pip`
- All prompt templates are module-level string constants — never build prompts inline inside a function
