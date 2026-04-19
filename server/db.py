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
