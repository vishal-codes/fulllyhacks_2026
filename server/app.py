"""
app.py
------
FastAPI server for the Medical Patient Simulator.

Startup:
    uv run app.py                        # runs uvicorn on :8000
    uvicorn app:app --reload --port 8000 # equivalent

Required environment variables (server/.env):
    GROQ_API_KEY   — Groq LLM for evaluation
    JWT_SECRET     — secret for signing auth tokens
    DATABASE_URL   — Neon Postgres connection string

Optional:
    HOST, PORT, RELOAD — uvicorn overrides

Routes
------
POST  /auth/login                 verify Google ID token → return JWT + user info
POST  /auth/register              alias of Google login/upsert flow

GET   /health
GET   /diseases                   list all supported disease names
GET   /diseases/{name}            symptoms + vitals ranges for a disease

POST  /session/new                create patient, start session  [auth required]
POST  /session/{session_id}/chat  send a doctor message          [auth required]
POST  /session/{session_id}/end   end session, get OSCE report   [auth required]
GET   /session/history            list current user's sessions   [auth required]
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from starlette.middleware.cors import CORSMiddleware

import model as _model
import db as _db
import auth as _auth
from knowledge_base import (
    list_diseases,
    disease_info,
    synthea_patient,
    synthea_patient_from_spec,
)
from session import create_session, get_session, remove_session
from report import generate_report

# Load .env if present (development convenience)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


# ---------------------------------------------------------------------------
# Startup / shutdown
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    _model.load()
    try:
        _db.init_db()
    except Exception as e:
        print(f"[DB] Warning: could not initialise database: {e}")
    yield


app = FastAPI(
    title="Medical Patient Simulator",
    description="Qwen2.5-1.5B + LoRA patient simulator — OSCE evaluation report",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request/response schemas
# ---------------------------------------------------------------------------

class GoogleLoginRequest(BaseModel):
    """Body for POST /auth/login — the Google ID token from the frontend."""
    id_token: str


class NewSessionRequest(BaseModel):
    """
    All fields optional.
    - No body → random patient from KB.
    - With disease (+ optional symptoms/vitals) → teacher-specified patient.
    """
    disease:    Optional[str]               = None
    symptoms:   Optional[list[str]]         = None
    vitals:     Optional[dict[str, float]]  = None
    difficulty: Literal["easy", "medium", "hard"] = "easy"


class ChatRequest(BaseModel):
    message:        str
    max_new_tokens: int = 120


def _today_utc_date():
    return datetime.now(timezone.utc).date()


def _competition_payload(session_id: str, patient: dict, competition_date: str) -> dict:
    return {
        "session_id": session_id,
        "competition_date": competition_date,
        "name": patient["name"],
        "age": patient["age"],
        "gender": patient["gender"],
        "vitals": patient["vitals"],
    }


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

async def _login_or_register(body: GoogleLoginRequest):
    """
    Verify a Google ID token (issued by NextAuth on the frontend).
    Create or update the user in Neon Postgres.
    Return a signed JWT the frontend stores and sends on every subsequent request.
    """
    claims = await _auth.verify_google_id_token(body.id_token)

    user = _db.upsert_user(
        google_sub=claims["sub"],
        email=claims.get("email", ""),
        name=claims.get("name", claims.get("email", "Unknown")),
    )

    token = _auth.create_access_token(user["id"])
    return {
        "access_token": token,
        "token_type":   "bearer",
        "user": {
            "id":         user["id"],
            "email":      user["email"],
            "name":       user["name"],
        },
    }


@app.post("/auth/login")
async def login(body: GoogleLoginRequest):
    return await _login_or_register(body)


@app.post("/auth/register")
async def register(body: GoogleLoginRequest):
    return await _login_or_register(body)


@app.get("/auth/schema")
def auth_schema():
    """Return the SQL schema used for Google-backed user profiles and sessions."""
    return {
        "users": _db.USER_PROFILE_SCHEMA_SQL,
        "sessions": _db.SESSION_SCHEMA_SQL,
        "competitions": _db.COMPETITION_SCHEMA_SQL,
    }


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Disease catalogue
# ---------------------------------------------------------------------------

@app.get("/diseases")
def get_diseases():
    """Return all disease names supported by the KB."""
    return {"diseases": list_diseases()}


@app.get("/diseases/{disease_name}")
def get_disease_info(disease_name: str):
    """Return symptoms, treatments, and vitals ranges for a disease."""
    info = disease_info(disease_name)
    if info is None:
        raise HTTPException(
            status_code=404,
            detail=f"Disease '{disease_name}' not found in the knowledge base.",
        )
    return info


@app.get("/competition/today")
def competition_today(user_id: str = Depends(_auth.get_current_user_id)):
    today = _today_utc_date()
    competition = _db.get_daily_competition(today)
    if competition is None:
        patient = synthea_patient()
        competition = _db.create_daily_competition(today, patient["disease"], patient)

    attempt = _db.get_competition_attempt(user_id, today)
    return {
        "competition_date": str(today),
        "has_started": attempt is not None,
        "has_completed": bool(attempt and attempt.get("ended_at") is not None),
        "attempt": attempt,
        "patient_preview": {
            "name": competition["patient"]["name"],
            "age": competition["patient"]["age"],
            "gender": competition["patient"]["gender"],
        },
    }


@app.post("/competition/start")
def start_competition(user_id: str = Depends(_auth.get_current_user_id)):
    today = _today_utc_date()
    existing_attempt = _db.get_competition_attempt(user_id, today)
    if existing_attempt is not None:
        raise HTTPException(
            status_code=409,
            detail="You have already started today's competition.",
        )

    competition = _db.get_daily_competition(today)
    if competition is None:
        patient = synthea_patient()
        competition = _db.create_daily_competition(today, patient["disease"], patient)

    patient = competition["patient"]
    session_id = create_session(
        patient,
        difficulty="medium",
        user_id=user_id,
        session_kind="competition",
        competition_date=str(today),
    )

    try:
        _db.create_competition_attempt(user_id, today, session_id)
    except Exception as e:
        remove_session(session_id)
        raise HTTPException(status_code=409, detail=f"Could not start competition: {e}")

    return _competition_payload(session_id, patient, str(today))


# ---------------------------------------------------------------------------
# Session routes
# ---------------------------------------------------------------------------

@app.post("/session/new")
def new_session(
    body: NewSessionRequest = NewSessionRequest(),
    user_id: str = Depends(_auth.get_current_user_id),
):
    """
    Create a new patient and start a session.
    Returns patient demographics, vitals, and a unique session_id.
    The frontend uses session_id in all subsequent /session/{id}/chat and /session/{id}/end calls.
    """
    if body.disease:
        patient = synthea_patient_from_spec(
            disease=body.disease,
            symptoms=body.symptoms or [],
            vitals=body.vitals or {},
        )
    else:
        patient = synthea_patient()

    session_id = create_session(patient, difficulty=body.difficulty, user_id=user_id)

    # Persist to DB (best-effort — don't fail if DB is unreachable)
    try:
        db_session_id = _db.create_session_record(
            user_id=user_id,
            disease=patient["disease"],
            difficulty=body.difficulty,
        )
        # Use the DB-generated UUID as the canonical session_id
        # Remap in-memory session to the DB id
        from session import _sessions
        gs = _sessions.pop(session_id)
        gs.user_id = user_id
        _sessions[db_session_id] = gs
        session_id = db_session_id
    except Exception as e:
        print(f"[DB] Could not persist session: {e}")

    return {
        "session_id": session_id,
        "name":       patient["name"],
        "age":        patient["age"],
        "gender":     patient["gender"],
        "disease":    patient["disease"],
        "vitals":     patient["vitals"],
    }


@app.post("/session/{session_id}/chat")
def chat(
    session_id: str,
    body: ChatRequest,
    user_id: str = Depends(_auth.get_current_user_id),
):
    """
    Send a doctor message for a specific session.
    Returns the patient's text response.
    """
    try:
        session = get_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if session.user_id is not None and session.user_id != user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this session.")

    if not session.is_active():
        raise HTTPException(status_code=400, detail="Session has already ended.")

    response = session.chat(body.message, max_new_tokens=body.max_new_tokens)
    return {"response": response}


@app.post("/session/{session_id}/end")
def end_session(
    session_id: str,
    user_id: str = Depends(_auth.get_current_user_id),
):
    """
    End the consultation and generate the full OSCE + counterfactual report.
    Saves the transcript and report to Neon Postgres before returning.
    """
    try:
        session = get_session(session_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")

    if session.user_id is not None and session.user_id != user_id:
        raise HTTPException(status_code=403, detail="You do not have access to this session.")

    if not session.is_active():
        raise HTTPException(status_code=400, detail="Session has already ended.")

    report = generate_report(session)
    session.end()

    # Persist report to DB (best-effort)
    try:
        final_diagnosis = report.get("osce_report", {}).get("domains", {}).get("final_diagnosis", {})
        is_correct = final_diagnosis.get("is_correct")
        total_score = report.get("osce_report", {}).get("total_score")
        if session.session_kind == "competition":
            _db.complete_competition_attempt(
                session_id=session_id,
                score=total_score,
            )
        else:
            _db.save_session_end(
                session_id=session_id,
                correct_diagnosis=is_correct,
            )
    except Exception as e:
        print(f"[DB] Could not save report: {e}")

    remove_session(session_id)
    return report


@app.get("/session/history")
def session_history(user_id: str = Depends(_auth.get_current_user_id)):
    """Return a list of past sessions for the current user (metadata only)."""
    try:
        return {"sessions": _db.list_user_sessions(user_id)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not fetch session history: {e}")


# ---------------------------------------------------------------------------
# Entry point — `uv run app.py`
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    host   = os.environ.get("HOST",   "0.0.0.0")
    port   = int(os.environ.get("PORT",   "8000"))
    reload = os.environ.get("RELOAD", "1") not in ("0", "false", "False")

    uvicorn.run("app:app", host=host, port=port, reload=reload)
