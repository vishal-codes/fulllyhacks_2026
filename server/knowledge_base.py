"""
knowledge_base.py
-----------------
Disease knowledge base + per-turn RAG retrieval + Synthea-style synthetic
patient generator.

Source of truth: ``diseases.json`` next to this file. Built offline by
``build_kb.py`` from NHS condition pages via Human Delta + Groq. Each entry
has the shape::

    {
      "name":       "Pneumonia",
      "symptoms":   ["fever", "productive cough", ...],
      "treatments": ["antibiotics", ...],
      "vitals_ranges": {
        "bp_sys": {"min": 100, "max": 130, "unit": "mmHg"},
        "bp_dia": {"min": 60,  "max": 85,  "unit": "mmHg"},
        "hr":     {"min": 90,  "max": 120, "unit": "bpm"},
        "temp":   {"min": 38.5,"max": 40.2,"unit": "C"},
        "spo2":   {"min": 86,  "max": 94,  "unit": "%"},
        "rr":     {"min": 22,  "max": 32,  "unit": "breaths/min"},
        "pain":   {"min": 4,   "max": 8,   "unit": "/10"}
      }
    }
"""

import json
import random
import re
from pathlib import Path

from faker import Faker


# ---------------------------------------------------------------------------
# Load diseases.json and build KB indexes
# ---------------------------------------------------------------------------

_HERE            = Path(__file__).parent
_DISEASES_PATH   = _HERE / "diseases.json"

SYMPTOM_KB:        dict[str, list[str]] = {}
TREATMENT_KB:      dict[str, list[str]] = {}
VITALS_RANGES_KB:  dict[str, dict]      = {}
DISEASE_INDEX:     dict[str, str]       = {}   # lower-cased name -> canonical name

_REQUIRED_VITAL_KEYS = ("bp_sys", "bp_dia", "hr", "temp", "spo2", "rr", "pain")

_NORMAL_VITALS = {
    "bp_sys": {"min": 105, "max": 125, "unit": "mmHg"},
    "bp_dia": {"min": 65,  "max": 80,  "unit": "mmHg"},
    "hr":     {"min": 60,  "max": 90,  "unit": "bpm"},
    "temp":   {"min": 36.4,"max": 37.2,"unit": "C"},
    "spo2":   {"min": 97,  "max": 100, "unit": "%"},
    "rr":     {"min": 14,  "max": 18,  "unit": "breaths/min"},
    "pain":   {"min": 0,   "max": 2,   "unit": "/10"},
}

_VITALS_UNITS = {k: v["unit"] for k, v in _NORMAL_VITALS.items()}


def _normalise_vitals(raw: dict | None) -> dict:
    """Fill in any missing vital keys with normal-vitals defaults."""
    out: dict[str, dict] = {}
    raw = raw or {}
    for key in _REQUIRED_VITAL_KEYS:
        entry = raw.get(key)
        if (
            isinstance(entry, dict)
            and isinstance(entry.get("min"), (int, float))
            and isinstance(entry.get("max"), (int, float))
        ):
            out[key] = {
                "min":  entry["min"],
                "max":  entry["max"],
                "unit": entry.get("unit") or _VITALS_UNITS[key],
            }
        else:
            out[key] = dict(_NORMAL_VITALS[key])
    return out


def _load_diseases() -> None:
    if not _DISEASES_PATH.exists():
        print(f"[KB] {_DISEASES_PATH.name} not found — knowledge base is empty.")
        return

    try:
        entries = json.loads(_DISEASES_PATH.read_text())
    except Exception as e:
        print(f"[KB] Failed to parse {_DISEASES_PATH.name}: {e}")
        return

    if not isinstance(entries, list):
        print(f"[KB] {_DISEASES_PATH.name} is not a JSON array.")
        return

    for row in entries:
        if not isinstance(row, dict):
            continue
        name = (row.get("name") or "").strip()
        if not name:
            continue
        SYMPTOM_KB[name]       = [s.strip() for s in row.get("symptoms") or [] if s and s.strip()]
        TREATMENT_KB[name]     = [t.strip() for t in row.get("treatments") or [] if t and t.strip()]
        VITALS_RANGES_KB[name] = _normalise_vitals(row.get("vitals_ranges"))
        DISEASE_INDEX[name.lower()] = name

    print(
        f"[KB] Loaded {len(SYMPTOM_KB)} diseases from {_DISEASES_PATH.name} "
        f"({sum(len(v) for v in SYMPTOM_KB.values())} symptoms total)"
    )


_load_diseases()


# ---------------------------------------------------------------------------
# Canonical-name resolution
# ---------------------------------------------------------------------------


def _resolve_disease(name: str) -> str | None:
    """Return the canonical disease key for a user-supplied name, or None."""
    if not name:
        return None
    if name in SYMPTOM_KB:
        return name
    nl = name.lower()
    if nl in DISEASE_INDEX:
        return DISEASE_INDEX[nl]
    for canonical_lower, canonical in DISEASE_INDEX.items():
        if nl in canonical_lower or canonical_lower in nl:
            return canonical
    return None


# ---------------------------------------------------------------------------
# Per-turn RAG retrieval
# ---------------------------------------------------------------------------

_Q_KEYWORDS: dict[str, list[str]] = {
    "onset":       ["when", "start", "began", "long", "ago", "duration", "first"],
    "location":    ["where", "location", "side", "area", "place", "point"],
    "character":   ["describe", "like", "feel", "type", "nature", "kind", "quality"],
    "severity":    ["severe", "bad", "scale", "rate", "mild", "worse", "better", "intensity"],
    "associated":  ["other", "also", "else", "additional", "along", "together"],
    "history":     ["history", "before", "previous", "ever", "past", "background"],
    "aggravating": ["worse", "aggravate", "trigger", "cause", "bring on", "makes it"],
    "relieving":   ["better", "relieve", "help", "ease", "alleviate"],
    "systemic":    ["fever", "weight", "appetite", "tired", "fatigue", "night sweat"],
}


def rag_retrieve(disease: str, question: str) -> list[str]:
    """
    Return the 3-5 canonical symptoms most relevant to the current
    doctor question for the given disease.
    """
    canonical = _resolve_disease(disease)
    all_syms = SYMPTOM_KB.get(canonical, []) if canonical else []
    if not all_syms:
        return []

    q_lower = question.lower()
    intent_tokens: set[str] = set()
    for keywords in _Q_KEYWORDS.values():
        if any(kw in q_lower for kw in keywords):
            intent_tokens.update(keywords)
    intent_tokens.update(q_lower.split())

    def _score(sym: str) -> int:
        sl = sym.lower()
        return sum(1 for tok in intent_tokens if tok in sl)

    scored = sorted(all_syms, key=_score, reverse=True)
    top = [s for s in scored if _score(s) > 0][:5]
    return top if top else all_syms[:5]


# ---------------------------------------------------------------------------
# Vitals
# ---------------------------------------------------------------------------


def _vital_from_range(key: str, range_entry: dict):
    """Sample a single vital value from a {min, max} dict."""
    lo, hi = range_entry["min"], range_entry["max"]
    if key == "temp":
        return round(random.uniform(float(lo), float(hi)), 1)
    return random.randint(int(lo), int(hi))


def disease_vitals_ranges(disease: str) -> dict:
    """
    Return the vitals ranges for a disease as a dict of
    ``{key: {min, max, unit}}``. Falls back to normal vitals for any disease
    not in the KB or any key missing from the disease's entry.
    """
    canonical = _resolve_disease(disease)
    if canonical and canonical in VITALS_RANGES_KB:
        return {k: dict(v) for k, v in VITALS_RANGES_KB[canonical].items()}
    return {k: dict(v) for k, v in _NORMAL_VITALS.items()}


# ---------------------------------------------------------------------------
# Synthea patient generator
# ---------------------------------------------------------------------------

FAKE = Faker("en_US")
Faker.seed(None)

_GENERIC_ONSETS = [
    "started about {n} days ago",
    "been going on for about {n} days",
    "began suddenly {n} hours ago",
    "developed over the last {n} days",
    "came on about {n} days ago",
]

_GENERIC_HISTORY = [
    "no significant past medical history",
    "hypertension, well controlled on medication",
    "type 2 diabetes, diet controlled",
    "previous similar episodes",
    "no regular medications",
    "mild asthma, uses inhaler occasionally",
    "ex-smoker, quit 5 years ago",
    "family history of heart disease",
    "allergic to penicillin",
    "previous surgery 2 years ago",
]


def _demographics() -> dict:
    age = random.randint(18, 78)
    gender = random.choice(["Male", "Female"])
    first = FAKE.first_name_male() if gender == "Male" else FAKE.first_name_female()
    last = FAKE.last_name()
    return {
        "first":  first,
        "last":   last,
        "name":   f"{first} {last}",
        "age":    age,
        "gender": gender,
        "dob":    FAKE.date_of_birth(minimum_age=age, maximum_age=age).strftime("%B %d, %Y"),
        "mrn":    FAKE.numerify("MRN-#######"),
    }


def _onset() -> str:
    n = random.choice([1, 2, 3, 5, 6, 10, 12, 24])
    return random.choice(_GENERIC_ONSETS).format(n=n)


def _history() -> str:
    return ", ".join(random.sample(_GENERIC_HISTORY, 2))


def _format_vitals(sample: dict[str, float | int]) -> dict[str, str]:
    return {
        "BP":   f"{sample['bp_sys']}/{sample['bp_dia']} mmHg",
        "HR":   f"{sample['hr']} bpm",
        "Temp": f"{sample['temp']}C",
        "SpO2": f"{sample['spo2']}%",
        "RR":   f"{sample['rr']} breaths/min",
        "Pain": f"{sample['pain']}/10",
    }


def synthea_patient() -> dict:
    """
    Generate a fully random synthetic patient sampled from the KB.
    """
    if not SYMPTOM_KB:
        raise RuntimeError("Knowledge base is empty — cannot generate patient.")

    disease = random.choice(list(SYMPTOM_KB.keys()))
    canonical = list(SYMPTOM_KB[disease]) or ["fatigue", "general discomfort"]

    n_syms = random.randint(min(2, len(canonical)), min(5, len(canonical)))
    selected = random.sample(canonical, n_syms)

    ranges = disease_vitals_ranges(disease)
    sample = {k: _vital_from_range(k, ranges[k]) for k in _REQUIRED_VITAL_KEYS}

    demo = _demographics()
    return {
        **demo,
        "disease":            disease,
        "symptoms":           ", ".join(selected),
        "canonical_symptoms": canonical,
        "treatments":         TREATMENT_KB.get(disease, []),
        "onset":              _onset(),
        "history":            _history(),
        "vitals":             _format_vitals(sample),
    }


def synthea_patient_from_spec(
    disease: str,
    symptoms: list[str],
    vitals: dict,
) -> dict:
    """
    Build a synthetic patient for a teacher-specified disease, symptom list,
    and (optional) vitals overrides.

    ``vitals`` is a flat dict of exact values the teacher set in the UI; any
    omitted key is sampled from the disease's default range::

        {"hr": 110, "temp": 39.2, "bp_sys": 145, "bp_dia": 90,
         "spo2": 92, "rr": 24, "pain": 6}
    """
    canonical_disease = _resolve_disease(disease) or disease
    canonical_symptoms = list(SYMPTOM_KB.get(canonical_disease, [])) or list(symptoms) or ["general discomfort"]

    ranges = disease_vitals_ranges(canonical_disease)
    vitals = vitals or {}

    def _v(key: str):
        if key in vitals and vitals[key] is not None:
            val = vitals[key]
            return round(float(val), 1) if key == "temp" else int(val)
        return _vital_from_range(key, ranges[key])

    sample = {k: _v(k) for k in _REQUIRED_VITAL_KEYS}

    if symptoms:
        symptom_str = ", ".join(symptoms)
    else:
        symptom_str = ", ".join(
            random.sample(canonical_symptoms, min(4, len(canonical_symptoms)))
        )

    demo = _demographics()
    return {
        **demo,
        "disease":            canonical_disease,
        "symptoms":           symptom_str,
        "canonical_symptoms": canonical_symptoms,
        "treatments":         TREATMENT_KB.get(canonical_disease, []),
        "onset":              _onset(),
        "history":            _history(),
        "vitals":             _format_vitals(sample),
    }


# ---------------------------------------------------------------------------
# Dynamic doctor-question generation (unchanged from legacy)
# ---------------------------------------------------------------------------

UNIVERSAL_QS = [
    "What is your name and how old are you?",
    "What brings you in today?",
    "When did your symptoms first start?",
]

_SYM_QUESTION_TEMPLATES: dict[str, list[str]] = {
    "pain": [
        "Can you describe the pain — is it sharp, dull, or throbbing?",
        "Does the pain radiate anywhere else?",
        "On a scale of 1 to 10, how would you rate the pain right now?",
        "Does anything make the pain better or worse?",
    ],
    "headache": [
        "Is the headache on one side or both sides?",
        "Do you have any sensitivity to light or sound?",
        "Have you had any visual changes before the headache starts?",
        "Does the headache come with nausea or vomiting?",
    ],
    "cough": [
        "Is the cough dry or are you bringing up sputum?",
        "What colour is the sputum?",
        "Do you have any chest tightness or shortness of breath?",
        "Does the cough wake you up at night?",
    ],
    "breathe|breath|dyspnoea|wheeze|wheezing": [
        "Does the breathlessness come on suddenly or gradually?",
        "Does it get worse when you lie down?",
        "How many pillows do you sleep on?",
        "Have you noticed any ankle swelling?",
    ],
    "tremor|shaking|stiffness|rigid": [
        "Is the shaking present at rest or only when you move?",
        "Has your handwriting changed?",
        "Do you have any difficulty with balance or walking?",
        "Has anyone commented on your facial expression or voice?",
    ],
    "thirst|urin|fatigue|vision": [
        "How often are you urinating compared to usual?",
        "Have you noticed any unintended weight loss?",
        "Has your vision been blurry recently?",
        "Do you have any tingling or numbness in your hands or feet?",
    ],
    "fever|chill|sweat": [
        "How high has your temperature been?",
        "Are you having chills or rigors?",
        "Have you had any night sweats?",
        "Have you been in contact with anyone who is unwell?",
    ],
    "nausea|vomit|appetite|abdomen|belly": [
        "Have you been vomiting? If so, how often?",
        "When did you last eat normally?",
        "Can you point to exactly where the pain or discomfort is worst?",
        "Have you noticed any change in your bowel habit?",
    ],
}

_CLOSING_QS = [
    "Do you have any relevant past medical history or ongoing conditions?",
    "Are you taking any regular medications?",
    "Does anyone in your family have a similar condition?",
]


def generate_doctor_questions(patient: dict, n_symptom_qs: int = 3) -> list[str]:
    """
    Build a personalised question list for this patient based on their
    symptoms and disease category.
    """
    sym_str = patient["symptoms"].lower() + " " + patient["disease"].lower()

    matched_qs: list[str] = []
    for pattern, qs in _SYM_QUESTION_TEMPLATES.items():
        if any(re.search(tok, sym_str) for tok in pattern.split("|")):
            matched_qs.extend(qs)

    if not matched_qs:
        matched_qs = [
            "Can you describe your main symptom in more detail?",
            "Does anything make it better or worse?",
            "Have you had any similar episodes in the past?",
        ]

    matched_qs = list(dict.fromkeys(matched_qs))
    random.shuffle(matched_qs)
    selected = matched_qs[:n_symptom_qs]

    return UNIVERSAL_QS + selected + random.sample(_CLOSING_QS, min(2, len(_CLOSING_QS)))


# ---------------------------------------------------------------------------
# Disease-catalogue lookups (used by the /diseases routes)
# ---------------------------------------------------------------------------


def list_diseases() -> list[str]:
    """Return all disease names in the KB, sorted alphabetically."""
    return sorted(SYMPTOM_KB.keys())


def disease_info(name: str) -> dict | None:
    """
    Return ``{disease, symptoms, treatments, vitals_ranges}`` for a disease.
    Matching is case-insensitive. Returns None if not found.
    """
    canonical = _resolve_disease(name)
    if canonical is None:
        return None
    return {
        "disease":       canonical,
        "symptoms":      list(SYMPTOM_KB[canonical]),
        "treatments":    list(TREATMENT_KB.get(canonical, [])),
        "vitals_ranges": disease_vitals_ranges(canonical),
    }
