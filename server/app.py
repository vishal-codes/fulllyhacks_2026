"""
app.py
------
FastAPI server for the medical patient simulator.

Endpoints
---------
POST  /session/new                  Create a new patient session
POST  /session/{id}/chat            Send a doctor message, get patient response
GET   /session/{id}/vitals          Patient vitals
GET   /session/{id}/hint            Age + gender hint
GET   /session/{id}/suggest         Next suggested question
GET   /session/{id}/revealed        Symptoms uncovered so far
POST  /session/{id}/diagnose        Submit a diagnosis and get the full reveal
POST  /session/{id}/medication      Submit medications (or skip with empty list)
GET   /session/{id}/report          Full end-to-end consultation report

GET   /diseases                     All disease names (for frontend dropdown)
GET   /diseases/{name}              Symptoms, treatments, sample vitals for a disease

Run:
    uvicorn app:app --reload --port 8000
"""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from typing import Optional
from inference import PatientSession, load_model
from knowledge_base import list_diseases, disease_info

# ---------------------------------------------------------------------------
# In-memory session store  {session_id: PatientSession}
# ---------------------------------------------------------------------------

_sessions: dict[str, PatientSession] = {}


# ---------------------------------------------------------------------------
# Lifespan — warm up model at startup so the first request isn't slow
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[app] Warming up model …")
    load_model()
    print("[app] Ready.")
    yield


app = FastAPI(
    title="Medical Patient Simulator",
    description="Qwen2.5-1.5B + LoRA patient simulator for medical training",
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class ChatRequest(BaseModel):
    message: str
    max_new_tokens: int = 120


class ChatResponse(BaseModel):
    response: str
    session_id: str


class DiagnoseRequest(BaseModel):
    disease: str


class VitalRange(BaseModel):
    min: float
    max: float
    unit: str = ""


class NewSessionRequest(BaseModel):
    disease: Optional[str] = None
    symptoms: Optional[list[str]] = None
    vitals_ranges: Optional[dict[str, VitalRange]] = None


class MedicationRequest(BaseModel):
    medications: list[str] = []  # empty list = skip


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_session(session_id: str) -> PatientSession:
    session = _sessions.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return session


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.post("/session/new")
def new_session(body: NewSessionRequest = NewSessionRequest()):
    """
    Create a new patient session.

    - No body → random patient from the full KB.
    - With body → use the doctor-supplied disease, symptoms, and vitals ranges.
      The frontend sends back whatever the doctor edited from GET /diseases/{name}.
    """
    session_id = str(uuid.uuid4())

    if body.disease:
        vitals_ranges = (
            {k: v.model_dump() for k, v in body.vitals_ranges.items()}
            if body.vitals_ranges else {}
        )
        _sessions[session_id] = PatientSession.from_spec(
            disease=body.disease,
            symptoms=body.symptoms or [],
            vitals_ranges=vitals_ranges,
        )
    else:
        _sessions[session_id] = PatientSession.new()

    patient = _sessions[session_id].patient
    return {
        "session_id": session_id,
        "message":    "New patient has arrived. Begin your consultation.",
        "patient_info": {
            "mrn":    patient["mrn"],
            "age":    patient["age"],
            "gender": patient["gender"],
        },
    }


@app.post("/session/{session_id}/chat", response_model=ChatResponse)
def chat(session_id: str, body: ChatRequest):
    """Send a doctor message and receive the patient's response."""
    session = _get_session(session_id)
    response = session.chat(body.message, max_new_tokens=body.max_new_tokens)
    return ChatResponse(response=response, session_id=session_id)


@app.get("/session/{session_id}/vitals")
def vitals(session_id: str):
    """Return the patient's current vital signs."""
    return _get_session(session_id).vitals()


@app.get("/session/{session_id}/hint")
def hint(session_id: str):
    """Return age and gender without revealing the disease."""
    return _get_session(session_id).hint()


@app.get("/session/{session_id}/suggest")
def suggest(session_id: str):
    """Return the next suggested doctor question."""
    q = _get_session(session_id).suggest()
    return {"suggestion": q}


@app.get("/session/{session_id}/revealed")
def revealed(session_id: str):
    """Return symptoms the patient has confirmed so far."""
    return _get_session(session_id).revealed()


@app.post("/session/{session_id}/diagnose")
def diagnose(session_id: str, body: DiagnoseRequest):
    """
    Submit a diagnosis. Returns CORRECT / CLOSE / INCORRECT plus the
    full disease reveal with symptom coverage stats.
    """
    return _get_session(session_id).diagnose(body.disease)


@app.post("/session/{session_id}/medication")
def medication(session_id: str, body: MedicationRequest):
    """
    Submit prescribed medications after diagnosis (pass an empty list to skip).
    Returns a summary; call /session/{id}/report afterwards to get the full report.
    """
    return _get_session(session_id).submit_medication(body.medications)


@app.get("/session/{session_id}/report")
def report(session_id: str):
    """
    Generate and return the complete end-to-end consultation report.
    Includes patient info, vitals, full transcript, symptom coverage,
    diagnosis result, and prescribed medications.
    """
    return _get_session(session_id).generate_report()


# ---------------------------------------------------------------------------
# Disease catalogue (for frontend disease-selector)
# ---------------------------------------------------------------------------


@app.get("/diseases")
def get_diseases():
    """Return all disease names in the KB (alphabetically sorted)."""
    return {"diseases": list_diseases()}


@app.get("/diseases/{disease_name}")
def get_disease_info(disease_name: str):
    """
    Return symptoms, treatments, and a sample vitals profile for a disease.
    Matching is case-insensitive.
    """
    info = disease_info(disease_name)
    if info is None:
        raise HTTPException(status_code=404, detail=f"Disease '{disease_name}' not found")
    return info


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    """Clean up a finished session."""
    if session_id not in _sessions:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    del _sessions[session_id]
    return {"deleted": session_id}


@app.get("/health")
def health():
    return {"status": "ok", "active_sessions": len(_sessions)}
