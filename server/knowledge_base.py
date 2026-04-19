"""
knowledge_base.py
-----------------
RAG symptom/treatment knowledge base, per-turn retrieval, and
Synthea-style synthetic patient generator.

Loads QuyenAnhDE/Diseases_Symptoms (~400 diseases) once at import time.
Falls back to a small static KB if the dataset is unavailable.
"""

import os
import re
import random

from faker import Faker

# ---------------------------------------------------------------------------
# Load dataset + build KB dicts
# ---------------------------------------------------------------------------

SYMPTOM_KB: dict[str, list[str]] = {}
TREATMENT_KB: dict[str, list[str]] = {}

try:
    from datasets import load_dataset
    _ds = load_dataset("QuyenAnhDE/Diseases_Symptoms", split="train")
    for _row in _ds:
        _name = (_row.get("Name") or "").strip()
        _syms = (_row.get("Symptoms") or "").strip()
        _trts = (_row.get("Treatments") or "").strip()
        if not _name or not _syms:
            continue
        SYMPTOM_KB[_name] = [s.strip() for s in _syms.split(",") if s.strip()]
        TREATMENT_KB[_name] = [t.strip() for t in _trts.split(",") if t.strip()] if _trts else []
    print(f"[KB] Loaded {len(SYMPTOM_KB)} diseases, "
          f"{sum(len(v) for v in SYMPTOM_KB.values())} symptoms total")
except Exception as e:
    print(f"[KB] Dataset load failed ({e}), using static fallback")
    SYMPTOM_KB = {
        "Pneumonia":      ["Fever", "Productive cough", "Chest pain", "Dyspnoea", "Rigors"],
        "Influenza":      ["Fever", "Myalgia", "Headache", "Dry cough", "Fatigue"],
        "Panic disorder": ["Palpitations", "Sweating", "Trembling", "Shortness of breath", "Dizziness"],
        "GERD":           ["Heartburn", "Regurgitation", "Chest pain", "Dysphagia", "Hoarseness"],
        "Appendicitis":   ["Abdominal pain", "Nausea", "Vomiting", "Fever", "Loss of appetite"],
    }
    TREATMENT_KB = {}


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
    all_syms = SYMPTOM_KB.get(disease, [])
    if not all_syms:
        dl = disease.lower()
        for k, v in SYMPTOM_KB.items():
            if k.lower() in dl or dl in k.lower():
                all_syms = v
                break
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
# Vitals profiles
# ---------------------------------------------------------------------------

_VITALS_BY_CATEGORY = [
    ("pneumonia",  {"temp": (38.5, 40.2), "hr": (90, 120), "spo2": (86, 94), "rr": (22, 32), "pain": (4, 8)}),
    ("influenza",  {"temp": (38.3, 40.0), "hr": (85, 115), "spo2": (94, 98), "rr": (18, 26), "pain": (4, 8)}),
    ("bronch",     {"temp": (37.5, 38.9), "hr": (75, 105), "spo2": (91, 97), "rr": (18, 26), "pain": (2, 5)}),
    ("asthma",     {"hr": (95, 125), "spo2": (85, 93), "rr": (24, 36), "pain": (3, 7)}),
    ("embolism",   {"hr": (100, 135), "spo2": (84, 92), "rr": (24, 34), "pain": (5, 9)}),
    ("angina",     {"bp_sys": (130, 170), "bp_dia": (82, 105), "hr": (80, 120), "pain": (5, 9)}),
    ("infarct",    {"bp_sys": (140, 180), "bp_dia": (85, 110), "hr": (85, 125), "pain": (6, 10)}),
    ("panic",      {"hr": (100, 145), "bp_sys": (130, 170), "pain": (3, 7)}),
    ("anxiety",    {"hr": (85, 110), "bp_sys": (120, 150), "pain": (1, 4)}),
    ("headache",   {"hr": (70, 100), "pain": (6, 10)}),
    ("migraine",   {"hr": (65, 90), "pain": (7, 10)}),
    ("fever",      {"temp": (38.5, 40.5), "hr": (90, 115), "pain": (3, 7)}),
    ("infection",  {"temp": (38.0, 40.0), "hr": (85, 115), "pain": (3, 7)}),
    ("sepsis",     {"temp": (38.5, 40.5), "hr": (100, 130), "bp_sys": (80, 110), "spo2": (88, 95), "pain": (4, 8)}),
    ("fracture",   {"pain": (6, 10)}),
    ("poisoning",  {"hr": (90, 130), "pain": (4, 9)}),
    ("cancer",     {"temp": (37.0, 38.5), "hr": (80, 110), "spo2": (88, 96), "pain": (4, 9)}),
    ("tumor",      {"hr": (75, 105), "pain": (3, 8)}),
    ("appendicitis", {"temp": (37.5, 39.5), "hr": (85, 115), "pain": (6, 10)}),
    ("gastro",     {"hr": (80, 110), "pain": (3, 8)}),
]

_NORMAL_VITALS = {
    "bp_sys": (105, 125), "bp_dia": (65, 80), "hr": (60, 90),
    "temp": (36.4, 37.2), "spo2": (97, 100), "rr": (14, 18), "pain": (0, 2),
}


def _vitals_profile(disease: str) -> dict:
    dl = disease.lower()
    for substr, profile in _VITALS_BY_CATEGORY:
        if substr in dl:
            return profile
    return {}


def _vital(disease: str, key: str):
    lo, hi = _vitals_profile(disease).get(key, _NORMAL_VITALS[key])
    if key == "temp":
        return round(random.uniform(lo, hi), 1)
    return random.randint(int(lo), int(hi))


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


def synthea_patient() -> dict:
    """
    Generate a fully synthetic patient sampled from all KB diseases.
    """
    disease = random.choice(list(SYMPTOM_KB.keys()))
    canonical = list(SYMPTOM_KB.get(disease, ["fatigue", "general discomfort"]))

    n_syms = random.randint(2, min(5, len(canonical)))
    selected = random.sample(canonical, n_syms)

    age = random.randint(18, 78)
    gender = random.choice(["Male", "Female"])
    first = FAKE.first_name_male() if gender == "Male" else FAKE.first_name_female()
    last = FAKE.last_name()
    name = f"{first} {last}"
    dob = FAKE.date_of_birth(minimum_age=age, maximum_age=age).strftime("%B %d, %Y")
    mrn = FAKE.numerify("MRN-#######")

    onset_n = random.choice([1, 2, 3, 5, 6, 10, 12, 24])
    onset = random.choice(_GENERIC_ONSETS).format(n=onset_n)
    history = ", ".join(random.sample(_GENERIC_HISTORY, 2))

    return {
        "name":               name,
        "first":              first,
        "last":               last,
        "dob":                dob,
        "mrn":                mrn,
        "age":                age,
        "gender":             gender,
        "disease":            disease,
        "symptoms":           ", ".join(selected),
        "canonical_symptoms": canonical,
        "treatments":         TREATMENT_KB.get(disease, []),
        "onset":              onset,
        "history":            history,
        "vitals": {
            "BP":   f"{_vital(disease, 'bp_sys')}/{_vital(disease, 'bp_dia')} mmHg",
            "HR":   f"{_vital(disease, 'hr')} bpm",
            "Temp": f"{_vital(disease, 'temp')}C",
            "SpO2": f"{_vital(disease, 'spo2')}%",
            "RR":   f"{_vital(disease, 'rr')} breaths/min",
            "Pain": f"{_vital(disease, 'pain')}/10",
        },
    }


# ---------------------------------------------------------------------------
# Dynamic doctor question generation
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
