"""
db.py
-----
Neon Postgres connection and CRUD for users + sessions.

Set in server/.env:
  DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
"""

import os
import uuid
from contextlib import contextmanager
from datetime import date
from typing import Generator

import psycopg2
import psycopg2.extras

psycopg2.extras.register_uuid()


def _get_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise EnvironmentError(
            "DATABASE_URL is not set. "
            "Add it to server/.env: "
            "DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require"
        )
    return url


@contextmanager
def _conn() -> Generator:
    conn = psycopg2.connect(_get_url())
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Schema bootstrap
# ---------------------------------------------------------------------------

USER_PROFILE_SCHEMA_SQL = """
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub  TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
""".strip()

SESSION_SCHEMA_SQL = """
CREATE TABLE sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disease        TEXT NOT NULL,
    difficulty     TEXT NOT NULL DEFAULT 'easy',
    correct_diagnosis BOOLEAN,
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    ended_at       TIMESTAMPTZ
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
""".strip()

COMPETITION_SCHEMA_SQL = """
CREATE TABLE daily_competitions (
    competition_date DATE PRIMARY KEY,
    disease          TEXT NOT NULL,
    patient          JSONB NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE competition_attempts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_date  DATE NOT NULL REFERENCES daily_competitions(competition_date) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id        UUID UNIQUE NOT NULL,
    score             INTEGER,
    started_at        TIMESTAMPTZ DEFAULT NOW(),
    ended_at          TIMESTAMPTZ,
    UNIQUE (competition_date, user_id)
);

CREATE INDEX competition_attempts_date_idx ON competition_attempts(competition_date);
CREATE INDEX competition_attempts_user_id_idx ON competition_attempts(user_id);
""".strip()

_SCHEMA = f"""
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_sub  TEXT UNIQUE NOT NULL,
    email       TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    disease        TEXT NOT NULL,
    difficulty     TEXT NOT NULL DEFAULT 'easy',
    correct_diagnosis BOOLEAN,
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    ended_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS daily_competitions (
    competition_date DATE PRIMARY KEY,
    disease          TEXT NOT NULL,
    patient          JSONB NOT NULL,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS competition_attempts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competition_date  DATE NOT NULL REFERENCES daily_competitions(competition_date) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id        UUID UNIQUE NOT NULL,
    score             INTEGER,
    started_at        TIMESTAMPTZ DEFAULT NOW(),
    ended_at          TIMESTAMPTZ,
    UNIQUE (competition_date, user_id)
);

CREATE INDEX IF NOT EXISTS competition_attempts_date_idx ON competition_attempts(competition_date);
CREATE INDEX IF NOT EXISTS competition_attempts_user_id_idx ON competition_attempts(user_id);
"""


def init_db() -> None:
    """Create tables if they don't exist. Safe to call on every startup."""
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(_SCHEMA)
    print("[DB] Schema ready.")


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def upsert_user(google_sub: str, email: str, name: str) -> dict:
    """Insert or update user by google_sub. Returns the user row."""
    sql = """
        INSERT INTO users (google_sub, email, name)
        VALUES (%s, %s, %s)
        ON CONFLICT (google_sub) DO UPDATE
            SET email      = EXCLUDED.email,
                name       = EXCLUDED.name
        RETURNING id, google_sub, email, name, created_at
    """
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (google_sub, email, name))
            row = dict(cur.fetchone())
            row["id"] = str(row["id"])
            return row


def get_user_by_id(user_id: str) -> dict | None:
    """Fetch a user by UUID string. Returns None if not found."""
    sql = "SELECT id, email, name, created_at FROM users WHERE id = %s"
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (uuid.UUID(user_id),))
            row = cur.fetchone()
            if row is None:
                return None
            result = dict(row)
            result["id"] = str(result["id"])
            return result


# ---------------------------------------------------------------------------
# Sessions
# ---------------------------------------------------------------------------

def create_session_record(user_id: str, disease: str, difficulty: str) -> str:
    """Insert a new session row. Returns the generated UUID as a string."""
    sql = """
        INSERT INTO sessions (user_id, disease, difficulty)
        VALUES (%s, %s, %s)
        RETURNING id
    """
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                uuid.UUID(user_id),
                disease,
                difficulty,
            ))
            return str(cur.fetchone()[0])


def save_session_end(session_id: str, correct_diagnosis: bool | None) -> None:
    """Update leaderboard fields for a completed session and mark it ended."""
    sql = """
        UPDATE sessions
        SET correct_diagnosis = %s,
            ended_at       = NOW()
        WHERE id = %s
    """
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                correct_diagnosis,
                uuid.UUID(session_id),
            ))


def list_user_sessions(user_id: str) -> list[dict]:
    """Return metadata for all sessions owned by user_id, newest first."""
    sql = """
        SELECT id, disease, difficulty, correct_diagnosis, started_at, ended_at
        FROM sessions
        WHERE user_id = %s
        ORDER BY started_at DESC
    """
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (uuid.UUID(user_id),))
            return [
                {**dict(r), "id": str(r["id"])}
                for r in cur.fetchall()
            ]


def get_daily_competition(competition_date: date) -> dict | None:
    sql = """
        SELECT competition_date, disease, patient, created_at
        FROM daily_competitions
        WHERE competition_date = %s
    """
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (competition_date,))
            row = cur.fetchone()
            return dict(row) if row is not None else None


def create_daily_competition(competition_date: date, disease: str, patient: dict) -> dict:
    sql = """
        INSERT INTO daily_competitions (competition_date, disease, patient)
        VALUES (%s, %s, %s)
        ON CONFLICT (competition_date) DO NOTHING
        RETURNING competition_date, disease, patient, created_at
    """
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (
                competition_date,
                disease,
                psycopg2.extras.Json(patient),
            ))
            row = cur.fetchone()
            if row is not None:
                return dict(row)

    existing = get_daily_competition(competition_date)
    if existing is None:
        raise RuntimeError("Failed to create or load daily competition.")
    return existing


def get_competition_attempt(user_id: str, competition_date: date) -> dict | None:
    sql = """
        SELECT id, competition_date, user_id, session_id, score, started_at, ended_at
        FROM competition_attempts
        WHERE user_id = %s AND competition_date = %s
    """
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (uuid.UUID(user_id), competition_date))
            row = cur.fetchone()
            if row is None:
                return None
            result = dict(row)
            result["id"] = str(result["id"])
            result["user_id"] = str(result["user_id"])
            result["session_id"] = str(result["session_id"])
            return result


def create_competition_attempt(user_id: str, competition_date: date, session_id: str) -> dict:
    sql = """
        INSERT INTO competition_attempts (competition_date, user_id, session_id)
        VALUES (%s, %s, %s)
        RETURNING id, competition_date, user_id, session_id, score, started_at, ended_at
    """
    with _conn() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (competition_date, uuid.UUID(user_id), uuid.UUID(session_id)))
            row = dict(cur.fetchone())
            row["id"] = str(row["id"])
            row["user_id"] = str(row["user_id"])
            row["session_id"] = str(row["session_id"])
            return row


def complete_competition_attempt(session_id: str, score: int | None) -> None:
    sql = """
        UPDATE competition_attempts
        SET score = %s,
            ended_at = NOW()
        WHERE session_id = %s
    """
    with _conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (score, uuid.UUID(session_id)))
