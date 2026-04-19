"""
conftest.py
-----------
Shared pytest fixtures for the medical simulator backend tests.

All heavy dependencies are mocked so tests run without:
  - downloading or loading the Qwen model (~3 GB)
  - a real GROQ_API_KEY
"""

import sys
import json
import os
from pathlib import Path
from unittest.mock import patch, MagicMock, call

import pytest
from fastapi.testclient import TestClient

# Make the server package importable from tests/
sys.path.insert(0, str(Path(__file__).parent.parent))

# ---------------------------------------------------------------------------
# Mock fixtures
# ---------------------------------------------------------------------------

MOCK_PATIENT_RESPONSE = "I have been having chest pain for about two days now."

# A valid OSCE JSON response that _call_groq will return
MOCK_OSCE_JSON = json.dumps({
    "osce_report": {
        "domains": {
            "history_taking": {
                "score": 20, "max": 25,
                "what_was_done_well": ["Asked about onset", "Covered main symptoms"],
                "what_was_missed": ["No social history", "Did not ask about medications"],
                "feedback": "Good systematic symptom history."
            },
            "clinical_reasoning": {
                "score": 18, "max": 25,
                "what_was_done_well": ["Logical follow-up questions"],
                "what_was_missed": ["Did not suggest investigations"],
                "feedback": "Reasonable clinical logic but differentials not explored."
            },
            "communication": {
                "score": 22, "max": 25,
                "what_was_done_well": ["Clear language", "Patient-friendly tone"],
                "what_was_missed": ["Could have shown more empathy"],
                "feedback": "Communication was clear and structured."
            },
            "final_diagnosis": {
                "score": 20, "max": 25,
                "inferred_diagnosis": "Pneumonia",
                "correct_diagnosis": "Pneumonia",
                "is_correct": True,
                "what_was_done_well": ["Correctly identified the disease"],
                "what_was_missed": [],
                "feedback": "Correct diagnosis reached through good questioning."
            }
        },
        "total_score": 80,
        "max_score": 100,
        "what_student_did_well": ["Systematic history", "Correct diagnosis"],
        "what_student_missed": ["Social history", "Investigations"],
        "examiner_note": "A solid consultation. Work on completing the social history."
    }
})

# A valid counterfactual JSON response for the second _call_groq call
MOCK_COUNTERFACTUAL_JSON = json.dumps({
    "counterfactual": {
        "missed_questions": [
            {
                "question": "Do you have any night sweats?",
                "why_important": "Night sweats can indicate systemic infection or malignancy.",
                "symptom_targeted": "night sweats"
            },
            {
                "question": "Have you coughed up any blood?",
                "why_important": "Haemoptysis is a red flag symptom in respiratory presentations.",
                "symptom_targeted": "haemoptysis"
            }
        ],
        "ideal_question_order": [
            "What is your name and how old are you?",
            "What brings you in today?",
            "When did your symptoms start?",
            "Do you have a fever or chills?",
            "Have you coughed up any blood?"
        ],
        "key_learning_point": "Always ask about red flag symptoms early in respiratory presentations."
    }
})


# ---------------------------------------------------------------------------
# Client fixture — module-scoped so it is created once per test file
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    """
    FastAPI TestClient with:
      - model.load() mocked (no Qwen weights loaded)
      - session.generate_patient_response mocked (no GPU/MPS inference)
      - report._call_groq mocked (no GROQ_API_KEY needed)
        The mock cycles: first call → OSCE JSON, second call → counterfactual JSON,
        then repeats for subsequent end calls.
    """
    def _groq_side_effect(prompt: str) -> str:
        # Distinguish the two calls by content: OSCE prompt contains "OSCE examiner"
        if "OSCE examiner" in prompt:
            return MOCK_OSCE_JSON
        return MOCK_COUNTERFACTUAL_JSON

    with patch("model.load"), \
         patch("session.generate_patient_response", return_value=MOCK_PATIENT_RESPONSE), \
         patch("report._call_groq", side_effect=_groq_side_effect):
        import app as app_module
        with TestClient(app_module.app) as c:
            yield c


# ---------------------------------------------------------------------------
# Helper fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def active_session(client):
    """POST /session/new with Pneumonia and return the response body."""
    resp = client.post("/session/new", json={"disease": "Pneumonia"})
    assert resp.status_code == 200, f"session/new failed: {resp.text}"
    return resp.json()


@pytest.fixture()
def chatted_session(client, active_session):
    """Start a session and send one doctor message."""
    resp = client.post("/session/chat", json={"message": "What is your name and how old are you?"})
    assert resp.status_code == 200
    return resp.json()
