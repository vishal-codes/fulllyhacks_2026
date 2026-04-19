"""
inference.py
------------
Mac-compatible model loading (no bitsandbytes/CUDA required) and
the full generation pipeline for the Qwen2.5-1.5B patient simulator.

Device priority: MPS (Apple Silicon) > CPU
"""

import os
import re
import torch
from datetime import datetime, timezone
from pathlib import Path
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel

from knowledge_base import (
    rag_retrieve,
    synthea_patient,
    synthea_patient_from_spec,
    generate_doctor_questions,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_HERE = Path(__file__).parent
ADAPTER_PATH = str(_HERE / "qwen-patient-adapter")
MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"

# ---------------------------------------------------------------------------
# Device selection — no bitsandbytes on Mac
# ---------------------------------------------------------------------------


def _get_device() -> torch.device:
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


DEVICE = _get_device()
_DTYPE = torch.float16 if DEVICE.type == "mps" else torch.float32

print(f"[inference] Device: {DEVICE}  dtype: {_DTYPE}")

# ---------------------------------------------------------------------------
# Tokenizer + model (lazy singleton — loaded once)
# ---------------------------------------------------------------------------

_tokenizer: AutoTokenizer | None = None
_model: PeftModel | None = None


def load_model() -> tuple[AutoTokenizer, PeftModel]:
    """
    Load tokenizer and model on first call; return cached objects thereafter.
    Loads the base Qwen2.5-1.5B-Instruct and applies the LoRA adapter.
    """
    global _tokenizer, _model

    if _tokenizer is not None and _model is not None:
        return _tokenizer, _model

    print(f"[inference] Loading tokenizer from {ADAPTER_PATH}")
    tok = AutoTokenizer.from_pretrained(ADAPTER_PATH)
    tok.padding_side = "right"
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token

    print(f"[inference] Loading base model {MODEL_ID} …")
    base = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=_DTYPE,
        low_cpu_mem_usage=True,
    )
    base = base.to(DEVICE)

    print(f"[inference] Applying LoRA adapter from {ADAPTER_PATH} …")
    mdl = PeftModel.from_pretrained(base, ADAPTER_PATH)
    mdl.eval()

    _tokenizer = tok
    _model = mdl

    # Build stop-token ID list
    _build_stop_ids(tok)

    print(f"[inference] Model ready | {mdl.num_parameters():,} params | {DEVICE}")
    return _tokenizer, _model


_STOP_IDS: list[int] = []
_STOP_STRINGS = ["<|im_end|>", "<|im_start|>", "\n<|im"]


def _build_stop_ids(tok: AutoTokenizer) -> None:
    global _STOP_IDS
    ids: set[int] = {tok.eos_token_id} - {None}
    for s in _STOP_STRINGS:
        encoded = tok.encode(s, add_special_tokens=False)
        if encoded:
            ids.add(encoded[0])
    _STOP_IDS = list(ids)


# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------


def build_prompt(history: list[dict]) -> str:
    parts = []
    for m in history:
        parts.append(f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>")
    parts.append("<|im_start|>assistant\n")
    return "\n".join(parts)


def _clean(text: str) -> str:
    for marker in ["<|im_end|>", "<|im_start|>", "<|endoftext|>",
                   "Doctor:", "\nUser:", "\nAssistant:"]:
        if marker in text:
            text = text.split(marker)[0]
    return text.strip()


# ---------------------------------------------------------------------------
# System-message builders
# ---------------------------------------------------------------------------


def make_system_msg(patient: dict, rag_context: list[str] | None = None) -> str:
    name = patient["name"]
    age = patient["age"]
    syms = patient["symptoms"]

    rag_block = ""
    if rag_context:
        rag_block = (
            "\n\nRELEVANT CLINICAL FACTS for this question "
            "(use these to answer accurately):\n"
            + "\n".join(f"  - {s}" for s in rag_context)
        )

    return (
        "You are the PATIENT in this medical consultation. "
        "The doctor is asking YOU questions. You are sitting in the exam room.\n\n"
        "=== YOUR PERSONAL DETAILS — MEMORISE THESE ===\n"
        f"  Name   : {name}\n"
        f"  Age    : {age} years old\n"
        f"  Gender : {patient['gender']}\n"
        f"  Symptoms you are experiencing: {syms}\n"
        f"  When symptoms started: {patient['onset']}\n"
        f"  Your past medical history: {patient['history']}\n"
        "================================================\n\n"
        "RULES — follow every one of these without exception:\n"
        f"  1. You ARE {name}, aged {age}. Never introduce yourself with any other name or age.\n"
        "  2. Speak only about YOUR OWN symptoms and health. "
        "Do NOT mention other people, family members, or unrelated events.\n"
        "  3. Answer ONLY what the doctor just asked — nothing more.\n"
        "  4. Do NOT name your diagnosis. Do NOT use medical jargon.\n"
        "  5. If the doctor asks something unrelated to your health, "
        "redirect: 'I\\'m not sure, but what I can tell you is I came here because of my symptoms.'\n\n"
        "REQUIRED RESPONSE FORMAT for name/age questions:\n"
        f"  Doctor: What is your name?  ->  Patient: My name is {name}.\n"
        f"  Doctor: How old are you?    ->  Patient: I am {age} years old.\n"
        f"  Doctor: What is your name and age?  ->  Patient: My name is {name} and I am {age} years old."
        + rag_block
    )


def make_aligned_system_msg(patient: dict, symptom_log: dict,
                             rag_context: list[str] | None = None) -> str:
    """Rebuild system message each turn with symptom log + RAG context."""
    base = make_system_msg(patient, rag_context)
    if not symptom_log:
        return base
    log_lines = "\n".join(
        f"  - When asked about '{q}': {a}"
        for q, a in symptom_log.items()
    )
    return (
        base
        + "\n\n=== WHAT YOU HAVE ALREADY TOLD THE DOCTOR (be consistent) ===\n"
        + log_lines
        + "\n=== Do NOT contradict any of the above in future answers. ==="
    )


def make_seed_turns(patient: dict) -> list[dict]:
    """Two grounded few-shot turns injected before the first real question."""
    name = patient["name"]
    age = patient["age"]
    syms_list = [s.strip() for s in patient["symptoms"].split(",")]
    chief = syms_list[0] if syms_list else "some discomfort"
    return [
        {"role": "user",      "content": "Doctor: Good morning. What is your name and how old are you?"},
        {"role": "assistant", "content": f"My name is {name} and I am {age} years old."},
        {"role": "user",      "content": "Doctor: What brings you in today?"},
        {"role": "assistant", "content": f"I've been having {chief} and it has been bothering me enough that I decided to come in."},
    ]


# ---------------------------------------------------------------------------
# Core generation
# ---------------------------------------------------------------------------


def generate_aligned(
    history: list[dict],
    patient: dict,
    symptom_log: dict,
    rag_context: list[str] | None = None,
    max_new_tokens: int = 120,
) -> str:
    """
    RAG-grounded aligned generation.
    Rebuilds the system message each turn so it includes the running
    symptom log (for consistency) and the per-turn RAG context.

    Identity guard: if the doctor asked for name/age and the model
    omitted them, replace with a canonical answer.
    """
    tok, mdl = load_model()

    if history and history[0]["role"] == "system":
        history[0]["content"] = make_aligned_system_msg(patient, symptom_log, rag_context)

    prompt = build_prompt(history)
    enc = tok(prompt, return_tensors="pt", truncation=True, max_length=2048)
    input_ids = enc["input_ids"].to(DEVICE)
    attn_mask = enc["attention_mask"].to(DEVICE)
    prompt_len = input_ids.shape[-1]

    with torch.no_grad():
        out = mdl.generate(
            input_ids=input_ids,
            attention_mask=attn_mask,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
            repetition_penalty=1.15,
            no_repeat_ngram_size=3,
            eos_token_id=_STOP_IDS if _STOP_IDS else tok.eos_token_id,
            pad_token_id=tok.pad_token_id,
        )

    raw = tok.decode(out[0][prompt_len:], skip_special_tokens=True)
    resp = _clean(raw)

    # Identity guard
    last_user = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"), ""
    )
    if re.search(r"\bname\b|\bhow old\b|\bage\b", last_user, re.I):
        rl = resp.lower()
        if not (patient["first"].lower() in rl and str(patient["age"]) in rl):
            resp = f"My name is {patient['name']} and I am {patient['age']} years old."

    return resp


def update_symptom_log(symptom_log: dict, question: str, response: str) -> dict:
    """Append a question/response pair to the running symptom log."""
    if len(response.split()) > 4:
        short_q = question[:40].rstrip("?.,") if len(question) > 40 else question.rstrip("?.,")
        symptom_log[short_q] = response[:120]
    return symptom_log


# ---------------------------------------------------------------------------
# DiseaseEngine — tracks progressive symptom revelation
# ---------------------------------------------------------------------------


class DiseaseEngine:
    """
    Maintains per-session state: which canonical symptoms have been
    mentioned by the patient, turn count, and coverage fraction.
    """

    def __init__(self, patient: dict):
        self.disease = patient["disease"]
        self.canonical = list(patient["canonical_symptoms"])
        self.treatments = list(patient.get("treatments", []))
        self.revealed: set[str] = set()
        self.turn_count = 0

    def update(self, patient_response: str) -> None:
        self.turn_count += 1
        rl = patient_response.lower()
        for sym in self.canonical:
            toks = [w.lower() for w in sym.split() if len(w) > 3]
            if any(tok in rl for tok in toks):
                self.revealed.add(sym)

    def revealed_summary(self) -> str:
        if not self.revealed:
            return "No symptoms confirmed yet."
        return "Confirmed so far: " + ", ".join(sorted(self.revealed))

    def coverage(self) -> float:
        return len(self.revealed) / max(len(self.canonical), 1)

    def reveal_full(self) -> dict:
        return {
            "disease":    self.disease,
            "canonical":  self.canonical,
            "revealed":   sorted(self.revealed),
            "treatments": self.treatments[:4],
            "coverage":   round(self.coverage(), 2),
            "turns":      self.turn_count,
        }


# ---------------------------------------------------------------------------
# Session helper — encapsulates all per-conversation state
# ---------------------------------------------------------------------------


class PatientSession:
    """
    One complete doctor-patient consultation session.
    Create via PatientSession.new() then call .chat(doctor_message).
    """

    def __init__(self, patient: dict):
        self.patient = patient
        self.engine = DiseaseEngine(patient)
        self.questions = generate_doctor_questions(patient, n_symptom_qs=4)
        self.history: list[dict] = (
            [{"role": "system", "content": make_system_msg(patient)}]
            + make_seed_turns(patient)
        )
        self.symptom_log: dict = {}
        self.q_idx = 0
        self.asked: list[str] = []
        self._diagnosis_result: dict | None = None
        self._medications: list[str] = []
        self._started_at: str = datetime.now(timezone.utc).isoformat()

    @classmethod
    def new(cls) -> "PatientSession":
        return cls(synthea_patient())

    @classmethod
    def from_spec(
        cls,
        disease: str,
        symptoms: list[str],
        vitals_ranges: dict,
    ) -> "PatientSession":
        """Create a session from a doctor-supplied disease + symptom + vitals spec."""
        return cls(synthea_patient_from_spec(disease, symptoms, vitals_ranges))

    # ── Public API ────────────────────────────────────────────────────────

    def chat(self, doctor_message: str, max_new_tokens: int = 120) -> str:
        """Send a doctor message; returns the patient's response."""
        self.asked.append(doctor_message)
        if self.q_idx < len(self.questions) and doctor_message == self.questions[self.q_idx]:
            self.q_idx += 1

        rag_ctx = rag_retrieve(self.patient["disease"], doctor_message)
        self.history.append({"role": "user", "content": f"Doctor: {doctor_message}"})

        resp = generate_aligned(
            self.history,
            self.patient,
            self.symptom_log,
            rag_context=rag_ctx,
            max_new_tokens=max_new_tokens,
        )
        self.history.append({"role": "assistant", "content": resp})
        self.engine.update(resp)
        self.symptom_log = update_symptom_log(self.symptom_log, doctor_message, resp)
        return resp

    def diagnose(self, submission: str) -> dict:
        """Evaluate the doctor's diagnosis, store result, and return the reveal."""
        corr = self.patient["disease"].lower()
        sub_words = set(submission.lower().split())
        cor_words = set(corr.split())

        if submission.lower() == corr:
            result = "CORRECT"
        elif sub_words & cor_words:
            result = "CLOSE"
        else:
            result = "INCORRECT"

        self._diagnosis_result = {
            "result":      result,
            "submission":  submission,
            "actual":      self.patient["disease"],
            "turns_taken": len(self.asked),
            "reveal":      self.engine.reveal_full(),
        }
        return self._diagnosis_result

    def submit_medication(self, medications: list[str]) -> dict:
        """
        Record prescribed medications (pass an empty list to skip).
        Returns a summary ready to display before the full report is fetched.
        """
        self._medications = [m.strip() for m in medications if m.strip()]
        kb_treatments = self.patient.get("treatments", [])
        return {
            "prescribed":   self._medications,
            "skipped":      len(self._medications) == 0,
            "kb_treatments": kb_treatments[:6],
        }

    def generate_report(self) -> dict:
        """
        Build the complete end-to-end consultation report.
        Includes patient demographics, vitals, full transcript, symptom
        coverage, diagnosis result, and prescribed medications.
        """
        p = self.patient
        reveal = self.engine.reveal_full()

        # Build readable transcript from history (skip seed turns and system msg)
        transcript = []
        history_turns = self.history[1:]  # drop system message
        i = 0
        while i < len(history_turns) - 1:
            user_msg = history_turns[i]
            asst_msg = history_turns[i + 1]
            if user_msg["role"] == "user" and asst_msg["role"] == "assistant":
                doctor_text = user_msg["content"]
                if doctor_text.startswith("Doctor: "):
                    doctor_text = doctor_text[8:]
                transcript.append({
                    "turn":    len(transcript) + 1,
                    "doctor":  doctor_text,
                    "patient": asst_msg["content"],
                })
            i += 2

        diagnosis = self._diagnosis_result or {}
        kb_treatments = p.get("treatments", [])

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "session_started_at": self._started_at,
            "patient": {
                "name":    p["name"],
                "age":     p["age"],
                "gender":  p["gender"],
                "mrn":     p["mrn"],
                "dob":     p["dob"],
                "onset":   p["onset"],
                "history": p["history"],
            },
            "vitals": p["vitals"],
            "consultation": {
                "transcript":  transcript,
                "turns_taken": len(transcript),
            },
            "symptoms": {
                "assigned":     [s.strip() for s in p["symptoms"].split(",")],
                "canonical":    reveal["canonical"],
                "revealed":     reveal["revealed"],
                "coverage_pct": round(self.engine.coverage() * 100, 1),
            },
            "diagnosis": {
                "submitted": diagnosis.get("submission", ""),
                "actual":    p["disease"],
                "result":    diagnosis.get("result", "NOT_SUBMITTED"),
            },
            "medications": {
                "prescribed":    self._medications,
                "skipped":       len(self._medications) == 0,
                "kb_treatments": kb_treatments[:6],
            },
        }

    def vitals(self) -> dict:
        return self.patient["vitals"]

    def hint(self) -> dict:
        return {"age": self.patient["age"], "gender": self.patient["gender"]}

    def suggest(self) -> str | None:
        if self.q_idx < len(self.questions):
            return self.questions[self.q_idx]
        return None

    def revealed(self) -> dict:
        return {
            "summary":  self.engine.revealed_summary(),
            "coverage": round(self.engine.coverage() * 100, 1),
        }
