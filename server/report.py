"""
report.py
---------
OSCE-style evaluation of a completed consultation via Groq LLM.

Scores the student doctor across four domains (0-25 each, total 100):
  1. History Taking     — systematic symptom and background questioning
  2. Clinical Reasoning — diagnostic logic, differentials, investigations
  3. Communication      — language, empathy, structure, flow
  4. Final Diagnosis    — inferred from conversation, compared to ground truth

Set GROQ_API_KEY in your environment before starting the server.
Model: llama-3.3-70b-versatile
"""

import os
import json
from groq import Groq

_client: Groq | None = None


def _get_groq() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GROQ_API_KEY environment variable is not set. "
                "Get a free key at https://console.groq.com"
            )
        _client = Groq(api_key=api_key)
    return _client


# ---------------------------------------------------------------------------
# OSCE evaluation prompt
# ---------------------------------------------------------------------------

_OSCE_PROMPT = """\
You are an OSCE examiner evaluating a medical student's consultation with a simulated patient.

GROUND TRUTH
------------
Disease            : {disease}
Canonical symptoms : {symptoms}
Standard treatments: {treatments}
Patient vitals     : {vitals}

FULL CONSULTATION TRANSCRIPT
-----------------------------
{transcript}

TASK
----
Read the transcript carefully. Score the student across FOUR domains (0-25 each, total 100).

DOMAIN 1 — HISTORY TAKING (0-25)
Award marks for systematically covering:
  - Presenting complaint (onset, duration, character, severity, location, radiation)
  - Relieving and aggravating factors
  - Associated symptoms
  - Relevant systems review
  - Past medical and surgical history
  - Current medications and allergies
  - Family history
  - Social history (smoking, alcohol, occupation)

DOMAIN 2 — CLINICAL REASONING (0-25)
Award marks for:
  - Asking questions that logically narrow toward the correct diagnosis
  - Demonstrating differential thinking
  - Mentioning relevant investigations, tests, or examination findings
  - Connecting symptoms to form a coherent clinical picture

DOMAIN 3 — COMMUNICATION (0-25)
Award marks for:
  - Using clear, plain language the patient can understand (no unnecessary jargon)
  - Starting with open questions, then focused closed questions
  - Showing empathy, patience, and acknowledgement of the patient's concerns
  - Logical, structured consultation flow
  - Avoiding leading questions or interruptions

DOMAIN 4 — FINAL DIAGNOSIS (0-25)
Read the entire transcript and infer what disease the student diagnosed.
The student may state it explicitly, imply it in a prescription, or indicate it through targeted questions.
  - Exact match or very close clinical equivalent → 23-25
  - Correct organ system / major category but not specific → 12-20
  - Vague or partially relevant → 5-11
  - Not stated or completely wrong → 0-4

Return ONLY the following JSON object — no markdown, no preamble, no trailing text:

{{
  "osce_report": {{
    "domains": {{
      "history_taking": {{
        "score": <integer 0-25>,
        "max": 25,
        "what_was_done_well": ["<point>", "..."],
        "what_was_missed": ["<point>", "..."],
        "feedback": "<2-3 sentence examiner comment>"
      }},
      "clinical_reasoning": {{
        "score": <integer 0-25>,
        "max": 25,
        "what_was_done_well": ["<point>", "..."],
        "what_was_missed": ["<point>", "..."],
        "feedback": "<2-3 sentence examiner comment>"
      }},
      "communication": {{
        "score": <integer 0-25>,
        "max": 25,
        "what_was_done_well": ["<point>", "..."],
        "what_was_missed": ["<point>", "..."],
        "feedback": "<2-3 sentence examiner comment>"
      }},
      "final_diagnosis": {{
        "score": <integer 0-25>,
        "max": 25,
        "inferred_diagnosis": "<what the student diagnosed, or 'not stated'>",
        "correct_diagnosis": "{disease}",
        "is_correct": <true | false>,
        "what_was_done_well": ["<point>", "..."],
        "what_was_missed": ["<point>", "..."],
        "feedback": "<2-3 sentence examiner comment>"
      }}
    }},
    "total_score": <sum of four domain scores>,
    "max_score": 100,
    "what_student_did_well": ["<overall strength>", "..."],
    "what_student_missed": ["<overall gap>", "..."],
    "examiner_note": "<3-4 sentence overall assessment for the student>"
  }}
}}
"""


# ---------------------------------------------------------------------------
# Counterfactual prompt
# ---------------------------------------------------------------------------

_COUNTERFACTUAL_PROMPT = """\
You are a senior clinical educator reviewing a medical student's consultation.

GROUND TRUTH
------------
Disease            : {disease}
Canonical symptoms : {symptoms}
Standard treatments: {treatments}
Patient vitals     : {vitals}
Student score      : {total_score}/100

FULL CONSULTATION TRANSCRIPT
-----------------------------
{transcript}

TASK
----
Based on the ground-truth disease and what the student actually asked, identify the KEY QUESTIONS
the student should have asked but did not. Focus on high-value questions that would have:
  1. Uncovered critical symptoms that were never revealed
  2. Helped the student narrow down the correct diagnosis faster
  3. Demonstrated stronger clinical reasoning

Also suggest the ideal order in which those questions should have been asked.

Return ONLY the following JSON object — no markdown, no preamble, no trailing text:

{{
  "counterfactual": {{
    "missed_questions": [
      {{
        "question": "<the question the student should have asked>",
        "why_important": "<1-2 sentences: what this would have revealed and why it matters clinically>",
        "symptom_targeted": "<which canonical symptom or clinical feature this question addresses>"
      }}
    ],
    "ideal_question_order": [
      "<question 1 to ask first>",
      "<question 2>",
      "<question 3>",
      "..."
    ],
    "key_learning_point": "<1-2 sentences summarising the most important lesson from this consultation>"
  }}
}}
"""


def _generate_counterfactual(patient: dict, transcript_turns: list[dict], total_score: int) -> dict:
    """Second Groq call: what questions should the student have asked?"""
    canonical = patient.get("canonical_symptoms", [])
    treatments = patient.get("treatments", [])[:6]
    vitals = patient["vitals"]

    prompt = _COUNTERFACTUAL_PROMPT.format(
        disease=patient["disease"],
        symptoms=", ".join(canonical),
        treatments=", ".join(treatments) if treatments else "not specified",
        vitals=", ".join(f"{k}: {v}" for k, v in vitals.items()),
        total_score=total_score,
        transcript=_format_transcript(transcript_turns),
    )

    raw = _call_groq(prompt)
    return _parse_json(raw)


# ---------------------------------------------------------------------------
# Public
# ---------------------------------------------------------------------------


def generate_report(session) -> dict:
    """
    Build the full OSCE evaluation report for the completed session.

    Returns a dict with:
      patient       — demographics
      vitals        — patient vitals
      transcript    — full conversation turns
      symptoms      — canonical vs revealed coverage
      osce_report   — structured OSCE scores and feedback (rendered by frontend)
    """
    patient = session.patient
    transcript_turns = session.get_transcript()
    coverage = session.symptom_coverage()

    canonical = patient.get("canonical_symptoms", [])
    treatments = patient.get("treatments", [])[:6]
    vitals = patient["vitals"]

    prompt = _OSCE_PROMPT.format(
        disease=patient["disease"],
        symptoms=", ".join(canonical),
        treatments=", ".join(treatments) if treatments else "not specified",
        vitals=", ".join(f"{k}: {v}" for k, v in vitals.items()),
        transcript=_format_transcript(transcript_turns),
    )

    raw = _call_groq(prompt)
    osce = _parse_json(raw)

    # Ensure total_score is always present even if Groq miscalculates
    total_score = 0
    if "osce_report" in osce and "domains" in osce["osce_report"]:
        domains = osce["osce_report"]["domains"]
        total_score = sum(
            domains.get(d, {}).get("score", 0)
            for d in ("history_taking", "clinical_reasoning", "communication", "final_diagnosis")
        )
        osce["osce_report"]["total_score"] = total_score

    # Second Groq call: counterfactual missed questions
    counterfactual = _generate_counterfactual(patient, transcript_turns, total_score)

    return {
        "patient": {
            "name":    patient["name"],
            "age":     patient["age"],
            "gender":  patient["gender"],
            "mrn":     patient.get("mrn", ""),
            "disease": patient["disease"],
            "onset":   patient.get("onset", ""),
            "history": patient.get("history", ""),
        },
        "vitals":     vitals,
        "transcript": transcript_turns,
        "symptoms":   coverage,
        **osce,           # merges osce_report key at top level
        **counterfactual, # merges counterfactual key at top level
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _format_transcript(turns: list[dict]) -> str:
    lines = []
    for t in turns:
        lines.append(f"Doctor : {t['doctor']}")
        if t.get("patient"):
            lines.append(f"Patient: {t['patient']}")
        lines.append("")
    return "\n".join(lines).strip()


def _call_groq(prompt: str) -> str:
    resp = _get_groq().chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=2000,
    )
    return resp.choices[0].message.content.strip()


def _parse_json(raw: str) -> dict:
    text = raw
    if "```" in text:
        parts = text.split("```")
        text = parts[1].lstrip("json").strip() if len(parts) >= 2 else text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"osce_report": {"parse_error": "Could not parse Groq response as JSON", "raw": raw}}
