"""
auth.py
-------
Google ID-token verification, JWT issuance, and FastAPI dependency.

Environment variables:
  JWT_SECRET  — secret for signing our JWTs
               Generate with: python -c "import secrets; print(secrets.token_hex(32))"
"""

import os

import httpx
from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

_JWT_SECRET  = os.environ.get("JWT_SECRET", "change-me-in-production")
_ALGORITHM   = "HS256"
_TOKENINFO   = "https://oauth2.googleapis.com/tokeninfo"

_bearer = HTTPBearer()


# ---------------------------------------------------------------------------
# Google token verification
# ---------------------------------------------------------------------------

async def verify_google_id_token(id_token: str) -> dict:
    """
    Verify a Google ID token via Google's tokeninfo endpoint.
    Returns the claims dict (sub, email, name, picture, …).
    Raises HTTPException 401 on failure.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(_TOKENINFO, params={"id_token": id_token})

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google ID token.")

    claims = resp.json()
    if "error_description" in claims:
        raise HTTPException(status_code=401, detail=claims["error_description"])

    return claims


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def create_access_token(user_id: str) -> str:
    """Issue a JWT whose 'sub' is the user UUID string."""
    return jwt.encode({"sub": user_id}, _JWT_SECRET, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> str:
    """Decode JWT and return the user_id string. Raises HTTPException 401 on failure."""
    try:
        payload = jwt.decode(token, _JWT_SECRET, algorithms=[_ALGORITHM])
        return payload["sub"]
    except (JWTError, KeyError):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(_bearer),
) -> str:
    """
    FastAPI dependency for protected routes.
    Extracts the Bearer JWT and returns the user_id string.
    """
    return decode_access_token(credentials.credentials)
