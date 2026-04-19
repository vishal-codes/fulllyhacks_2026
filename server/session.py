"""
session.py
----------
Single global consultation session.

All doctor/patient turns are stored here.  Call reset(patient) to start a
new consultation; call chat(message) for each doctor turn.
"""

from knowledge_base import rag_retrieve
from model import generate_patient_response


# ---------------------------------------------------------------------------
# DiseaseEngine — tracks which canonical symptoms have been mentioned
# ---------------------------------------------------------------------------


class DiseaseEngine:
    def __init__(self, patient: dict):
        self.disease = patient["disease"]
        self.canonical = list(patient["canonical_symptoms"])
        self.revealed: set[str] = set()

    def update(self, patient_response: str) -> None:
        rl = patient_response.lower()
        for sym in self.canonical:
            toks = [w.lower() for w in sym.split() if len(w) > 3]
            if any(tok in rl for tok in toks):
                self.revealed.add(sym)

    def coverage(self) -> float:
        return len(self.revealed) / max(len(self.canonical), 1)


# ---------------------------------------------------------------------------
# Difficulty modifiers
# ---------------------------------------------------------------------------

DIFFICULTY_MODIFIERS: dict[str, str] = {
    "easy": (
        "\n=== PATIENT BEHAVIOUR (EASY) ===\n"
        "You are calm and cooperative. Answer questions clearly and accurately.\n"
        "Volunteer relevant details when the doctor asks directly.\n"
        "================================\n"
    ),
    "medium": (
        "\n=== PATIENT BEHAVIOUR (MEDIUM) ===\n"
        "You are slightly anxious and worried about your condition.\n"
        "Be vague about exact durations — say things like "
        "'I think it was a few days ago, maybe a week?' rather than giving precise dates.\n"
        "Sometimes you need a follow-up question before giving a complete answer.\n"
        "You may ask the doctor what certain questions mean, but stay cooperative overall.\n"
        "==================================\n"
    ),
    "hard": (
        "\n=== PATIENT BEHAVIOUR (HARD) ===\n"
        "You are emotionally distressed and reluctant to engage fully.\n"
        "Behaviour rules — follow ALL of these:\n"
        "  - Be INCONSISTENT about timelines: contradict yourself on onset dates "
        "('last week... actually it might be two weeks, I'm not sure').\n"
        "  - MINIMISE your symptoms: 'It's probably nothing, I feel bad wasting your time.'\n"
        "  - ANCHOR on a self-diagnosis: 'I already looked it up, I think it's just stress.'\n"
        "  - DEFLECT clinical questions: 'I don't know, isn't that what you're supposed to figure out?'\n"
        "  - Occasionally express worry about practical concerns: work, family, cost of treatment.\n"
        "  - Only reveal your most significant symptom after the doctor has asked about it TWICE "
        "or shown genuine empathy.\n"
        "================================\n"
    ),
}


# ---------------------------------------------------------------------------
# Prompt builders
# ---------------------------------------------------------------------------

_SYSTEM_TEMPLATE = (
    "You are the PATIENT in this medical consultation. "
    "The doctor is asking YOU questions. You are sitting in the exam room.\n\n"
    "=== YOUR PERSONAL DETAILS — MEMORISE THESE ===\n"
    "  Name   : {name}\n"
    "  Age    : {age} years old\n"
    "  Gender : {gender}\n"
    "  Symptoms you are experiencing: {symptoms}\n"
    "  When symptoms started: {onset}\n"
    "  Your past medical history: {history}\n"
    "================================================\n\n"
    "RULES:\n"
    "  1. You ARE {name}, aged {age}. Never use any other name or age.\n"
    "  2. Speak only about YOUR OWN symptoms and health.\n"
    "  3. Answer ONLY what the doctor just asked — nothing more.\n"
    "  4. Do NOT name your diagnosis. Do NOT use medical jargon.\n"
    "  5. Keep responses to 2-4 sentences.\n\n"
    "REQUIRED RESPONSE FORMAT for name/age questions:\n"
    "  Doctor: What is your name?      ->  My name is {name}.\n"
    "  Doctor: How old are you?        ->  I am {age} years old.\n"
    "{difficulty_block}"
    "{rag_block}"
    "{log_block}"
)


def _make_system_msg(
    patient: dict,
    rag_context: list[str] | None = None,
    symptom_log: dict | None = None,
    difficulty: str = "easy",
) -> str:
    rag_block = ""
    if rag_context:
        rag_block = (
            "\nRELEVANT CLINICAL FACTS for this question "
            "(use these to answer accurately):\n"
            + "\n".join(f"  - {s}" for s in rag_context)
            + "\n"
        )

    log_block = ""
    if symptom_log:
        lines = "\n".join(
            f"  - When asked about '{q}': {a}" for q, a in symptom_log.items()
        )
        log_block = (
            "\n=== WHAT YOU HAVE ALREADY TOLD THE DOCTOR (be consistent) ===\n"
            + lines
            + "\n=== Do NOT contradict any of the above. ==="
        )

    difficulty_block = DIFFICULTY_MODIFIERS.get(difficulty, DIFFICULTY_MODIFIERS["easy"])

    return _SYSTEM_TEMPLATE.format(
        name=patient["name"],
        age=patient["age"],
        gender=patient["gender"],
        symptoms=patient["symptoms"],
        onset=patient["onset"],
        history=patient["history"],
        difficulty_block=difficulty_block,
        rag_block=rag_block,
        log_block=log_block,
    )


def _make_seed_turns(patient: dict) -> list[dict]:
    """Two grounded few-shot exchanges prepended before the real conversation."""
    first_sym = patient["symptoms"].split(",")[0].strip()
    return [
        {"role": "user",
         "content": "Doctor: What is your name and how old are you?"},
        {"role": "assistant",
         "content": f"My name is {patient['name']} and I am {patient['age']} years old."},
        {"role": "user",
         "content": "Doctor: What brings you in today?"},
        {"role": "assistant",
         "content": f"I've been having {first_sym} and it's been bothering me enough that I came in."},
    ]


# ---------------------------------------------------------------------------
# GlobalSession
# ---------------------------------------------------------------------------


class GlobalSession:
    """
    Single in-memory consultation session.
    history layout:
      [0]    system message  (rebuilt every turn with RAG + symptom log)
      [1..4] two seed turn pairs (grounding few-shots)
      [5+]   real doctor/patient exchanges
    """

    # Number of entries before the real conversation starts
    _HISTORY_OFFSET = 5

    def __init__(self):
        self.patient: dict | None = None
        self.history: list[dict] = []
        self.symptom_log: dict = {}
        self.engine: DiseaseEngine | None = None
        self.active: bool = False
        self.difficulty: str = "easy"
        self.user_id: str | None = None
        self.session_kind: str = "practice"
        self.competition_date: str | None = None

    # ── Lifecycle ─────────────────────────────────────────────────────────

    def reset(
        self,
        patient: dict,
        difficulty: str = "easy",
        user_id: str | None = None,
        session_kind: str = "practice",
        competition_date: str | None = None,
    ) -> None:
        """Start a new consultation with the given patient."""
        self.patient = patient
        self.engine = DiseaseEngine(patient)
        self.symptom_log = {}
        self.difficulty = difficulty
        self.user_id = user_id
        self.session_kind = session_kind
        self.competition_date = competition_date
        self.history = (
            [{"role": "system", "content": _make_system_msg(patient, difficulty=difficulty)}]
            + _make_seed_turns(patient)
        )
        self.active = True

    def end(self) -> None:
        self.active = False

    def is_active(self) -> bool:
        return self.active and self.patient is not None

    # ── Chat ──────────────────────────────────────────────────────────────

    def chat(self, doctor_message: str, max_new_tokens: int = 120) -> str:
        """
        Add doctor message to history, run the model, store patient response.
        Returns the patient response text.
        """
        if not self.is_active():
            raise RuntimeError("No active session — call /session/new first.")

        rag_ctx = rag_retrieve(self.patient["disease"], doctor_message)

        # Rebuild system message with latest RAG context + symptom log
        self.history[0]["content"] = _make_system_msg(
            self.patient, rag_ctx, self.symptom_log, self.difficulty
        )

        self.history.append({"role": "user", "content": f"Doctor: {doctor_message}"})
        resp = generate_patient_response(self.history, self.patient, max_new_tokens)
        self.history.append({"role": "assistant", "content": resp})

        # Track revealed symptoms
        self.engine.update(resp)

        # Update symptom log (used for consistency in the system prompt)
        if len(resp.split()) > 4:
            short_q = doctor_message[:40].rstrip("?.,")
            self.symptom_log[short_q] = resp[:120]

        return resp

    # ── Accessors ─────────────────────────────────────────────────────────

    def get_transcript(self) -> list[dict]:
        """Return real exchanges only (excludes system msg and seed turns)."""
        turns = []
        real = self.history[self._HISTORY_OFFSET:]
        for i in range(0, len(real) - 1, 2):
            user_msg = real[i]
            asst_msg = real[i + 1] if i + 1 < len(real) else None
            if user_msg["role"] != "user":
                continue
            doc_text = user_msg["content"]
            if doc_text.startswith("Doctor: "):
                doc_text = doc_text[8:]
            turns.append({
                "turn":    len(turns) + 1,
                "doctor":  doc_text,
                "patient": asst_msg["content"] if asst_msg else "",
            })
        return turns

    def symptom_coverage(self) -> dict:
        if self.engine is None:
            return {"canonical": [], "revealed": [], "coverage_pct": 0.0}
        return {
            "canonical":    self.engine.canonical,
            "revealed":     sorted(self.engine.revealed),
            "coverage_pct": round(self.engine.coverage() * 100, 1),
        }


# ---------------------------------------------------------------------------
# Session manager — keyed by UUID session_id
# ---------------------------------------------------------------------------

import uuid as _uuid_mod

_sessions: dict[str, GlobalSession] = {}


def create_session(
    patient: dict,
    difficulty: str = "easy",
    user_id: str | None = None,
    session_kind: str = "practice",
    competition_date: str | None = None,
) -> str:
    """
    Create a new GlobalSession for the given patient, store it, and return its
    UUID session_id string.  The caller is responsible for saving the id to DB.
    """
    session_id = str(_uuid_mod.uuid4())
    gs = GlobalSession()
    gs.reset(
        patient,
        difficulty=difficulty,
        user_id=user_id,
        session_kind=session_kind,
        competition_date=competition_date,
    )
    _sessions[session_id] = gs
    return session_id


def get_session(session_id: str) -> GlobalSession:
    """
    Return the active GlobalSession for session_id.
    Raises KeyError if not found (caller should convert to 404).
    """
    return _sessions[session_id]


def remove_session(session_id: str) -> None:
    """Remove the in-memory session after it has ended."""
    _sessions.pop(session_id, None)
