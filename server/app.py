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

Run:
    uvicorn app:app --reload --port 8000
"""

import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from inference import PatientSession, load_model

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
def new_session():
    """
    Create a new patient session with a randomly generated synthetic patient.
    Returns the session_id used for all subsequent calls.
    """
    session_id = str(uuid.uuid4())
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
