"""
app.py
------
FastAPI server for the Medical Patient Simulator.

Startup:
    uv run app.py                                    # runs uvicorn on :8000
    uvicorn app:app --reload --port 8000             # equivalent

Requires GROQ_API_KEY and HD_API_KEY in the environment or in a sibling
.env file.

Routes
------
GET   /health
GET   /diseases                  list all supported disease names
GET   /diseases/{name}           symptoms + vitals ranges for a disease
POST  /session/new               create patient, start session
POST  /session/chat              send a doctor message, get patient response
POST  /session/end               end session, get Groq evaluation report
"""

from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import model as _model
from knowledge_base import (
    list_diseases,
    disease_info,
    synthea_patient,
    synthea_patient_from_spec,
)
from session import get_session
from report import generate_report


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load Qwen + LoRA adapter into memory once; all requests reuse them.
    _model.load()
    yield


app = FastAPI(
    title="Medical Patient Simulator",
    description="Qwen2.5-1.5B + LoRA patient simulator — Groq evaluation report",
    version="2.0.0",
    lifespan=lifespan,
)

# Allow requests from the Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class NewSessionRequest(BaseModel):
    """
    All fields optional.
    - No body → random patient from the KB.
    - With disease (+ optional symptoms / vitals) → doctor-specified patient.

    vitals: flat dict of exact values the doctor set in the UI, e.g.
        {"hr": 110, "temp": 39.2, "bp_sys": 145, "bp_dia": 90,
         "spo2": 92, "rr": 24, "pain": 6}
    Any key omitted is sampled randomly from the disease's default range.
    """
    disease: Optional[str] = None
    symptoms: Optional[list[str]] = None
    vitals: Optional[dict[str, float]] = None
    difficulty: Literal["easy", "medium", "hard"] = "easy"


class ChatRequest(BaseModel):
    message: str
    max_new_tokens: int = 120


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health():
    s = get_session()
    return {"status": "ok", "session_active": s.is_active()}


# ── Disease catalogue ──────────────────────────────────────────────────────


@app.get("/diseases")
def get_diseases():
    """Return all disease names supported by the KB (sorted alphabetically)."""
    return {"diseases": list_diseases()}


@app.get("/diseases/{disease_name}")
def get_disease_info(disease_name: str):
    """
    Return symptoms, treatments, and vitals ranges for a disease.
    The doctor can edit the vitals ranges in the UI before starting a session.
    Matching is case-insensitive.
    """
    info = disease_info(disease_name)
    if info is None:
        raise HTTPException(
            status_code=404,
            detail=f"Disease '{disease_name}' not found in the knowledge base.",
        )
    return info


# ── Session ────────────────────────────────────────────────────────────────


@app.post("/session/new")
def new_session(body: NewSessionRequest = NewSessionRequest()):
    """
    Create a new patient and start the global session.

    If disease is provided the patient is built from the doctor's spec
    (disease + optional symptom list + optional edited vitals ranges).
    Otherwise a fully random patient is generated.

    Returns only: patient name, age, gender, disease, and actual vitals
    (sampled from the provided/default ranges) — the disease is revealed
    so the doctor knows what they're simulating.
    """
    if body.disease:
        patient = synthea_patient_from_spec(
            disease=body.disease,
            symptoms=body.symptoms or [],
            vitals=body.vitals or {},
        )
    else:
        patient = synthea_patient()

    session = get_session()
    session.reset(patient, difficulty=body.difficulty)

    return {
        "name":    patient["name"],
        "age":     patient["age"],
        "gender":  patient["gender"],
        "disease": patient["disease"],
        "vitals":  patient["vitals"],
    }


@app.post("/session/chat")
def chat(body: ChatRequest):
    """
    Send a doctor message.  The fine-tuned Qwen model generates the patient's
    response and returns it.  Both sides of the conversation are stored in
    memory for the final evaluation report.
    """
    session = get_session()
    if not session.is_active():
        raise HTTPException(
            status_code=400,
            detail="No active session. Call POST /session/new first.",
        )

    response = session.chat(body.message, max_new_tokens=body.max_new_tokens)
    return {"response": response}


@app.post("/session/end")
def end_session():
    """
    End the consultation and generate the full evaluation report via Groq.

    The report includes:
    - Patient demographics and vitals
    - Full conversation transcript
    - Symptom coverage (which canonical symptoms the patient revealed)
    - Evaluation: diagnosis accuracy, medication appropriateness,
      question quality — all extracted from the conversation by the LLM
    - Overall score and summary
    """
    session = get_session()
    if not session.is_active():
        raise HTTPException(
            status_code=400,
            detail="No active session to end.",
        )

    report = generate_report(session)
    session.end()
    return report


# ---------------------------------------------------------------------------
# Entry point — `uv run app.py`
# ---------------------------------------------------------------------------


if __name__ == "__main__":
    import os
    import uvicorn

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    reload = os.environ.get("RELOAD", "1") not in ("0", "false", "False")

    uvicorn.run("app:app", host=host, port=port, reload=reload)
