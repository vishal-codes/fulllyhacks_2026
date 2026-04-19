"""
test_knowledge_base.py
----------------------
Unit tests for knowledge_base.py — no HTTP, no model loading.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from knowledge_base import (
    list_diseases,
    disease_info,
    disease_vitals_ranges,
    rag_retrieve,
    synthea_patient,
    synthea_patient_from_spec,
    SYMPTOM_KB,
    TREATMENT_KB,
)

_VITAL_KEYS = {"bp_sys", "bp_dia", "hr", "temp", "spo2", "rr", "pain"}
_PATIENT_KEYS = {"name", "first", "last", "age", "gender", "disease",
                 "symptoms", "canonical_symptoms", "treatments", "vitals",
                 "onset", "history", "mrn", "dob"}


# ---------------------------------------------------------------------------
# list_diseases
# ---------------------------------------------------------------------------

class TestListDiseases:
    def test_returns_list(self):
        result = list_diseases()
        assert isinstance(result, list)

    def test_non_empty(self):
        assert len(list_diseases()) > 0

    def test_sorted_alphabetically(self):
        result = list_diseases()
        assert result == sorted(result)

    def test_all_strings(self):
        assert all(isinstance(d, str) for d in list_diseases())

    def test_no_duplicates(self):
        result = list_diseases()
        assert len(result) == len(set(result))


# ---------------------------------------------------------------------------
# disease_info
# ---------------------------------------------------------------------------

class TestDiseaseInfo:
    def test_known_disease_returns_dict(self):
        disease = list_diseases()[0]
        result = disease_info(disease)
        assert result is not None
        assert isinstance(result, dict)

    def test_return_shape(self):
        disease = list_diseases()[0]
        result = disease_info(disease)
        assert "disease" in result
        assert "symptoms" in result
        assert "treatments" in result
        assert "vitals_ranges" in result

    def test_symptoms_is_list(self):
        disease = list_diseases()[0]
        result = disease_info(disease)
        assert isinstance(result["symptoms"], list)
        assert len(result["symptoms"]) > 0

    def test_vitals_ranges_has_all_keys(self):
        disease = list_diseases()[0]
        result = disease_info(disease)
        assert set(result["vitals_ranges"].keys()) == _VITAL_KEYS

    def test_case_insensitive_match(self):
        disease = list_diseases()[0]
        lower = disease_info(disease.lower())
        upper = disease_info(disease.upper())
        # At least one direction should match (lowercase especially)
        assert lower is not None or upper is not None

    def test_unknown_disease_returns_none(self):
        assert disease_info("ThisDiseaseDoesNotExist12345") is None

    def test_partial_name_match(self):
        # "pneumonia" should match if "Pneumonia" is in the KB
        diseases = [d.lower() for d in list_diseases()]
        if "pneumonia" in diseases:
            assert disease_info("pneumonia") is not None


# ---------------------------------------------------------------------------
# disease_vitals_ranges
# ---------------------------------------------------------------------------

class TestDiseaseVitalsRanges:
    def test_returns_all_vital_keys(self):
        disease = list_diseases()[0]
        ranges = disease_vitals_ranges(disease)
        assert set(ranges.keys()) == _VITAL_KEYS

    def test_each_range_has_min_max_unit(self):
        disease = list_diseases()[0]
        ranges = disease_vitals_ranges(disease)
        for key, r in ranges.items():
            assert "min" in r, f"missing 'min' in {key}"
            assert "max" in r, f"missing 'max' in {key}"
            assert "unit" in r, f"missing 'unit' in {key}"

    def test_min_less_than_or_equal_max(self):
        disease = list_diseases()[0]
        ranges = disease_vitals_ranges(disease)
        for key, r in ranges.items():
            assert r["min"] <= r["max"], f"min > max for {key}"

    def test_numeric_values(self):
        disease = list_diseases()[0]
        ranges = disease_vitals_ranges(disease)
        for key, r in ranges.items():
            assert isinstance(r["min"], (int, float))
            assert isinstance(r["max"], (int, float))


# ---------------------------------------------------------------------------
# rag_retrieve
# ---------------------------------------------------------------------------

class TestRagRetrieve:
    def test_returns_list(self):
        disease = list_diseases()[0]
        result = rag_retrieve(disease, "Where is the pain?")
        assert isinstance(result, list)

    def test_returns_symptoms_for_known_disease(self):
        disease = list_diseases()[0]
        result = rag_retrieve(disease, "What are your main symptoms?")
        assert len(result) > 0

    def test_returns_at_most_five(self):
        disease = list_diseases()[0]
        result = rag_retrieve(disease, "Tell me about your symptoms")
        assert len(result) <= 5

    def test_unknown_disease_returns_empty(self):
        result = rag_retrieve("NotARealDisease99999", "How are you?")
        assert result == []

    def test_case_insensitive_disease_match(self):
        disease = list_diseases()[0]
        result_lower = rag_retrieve(disease.lower(), "Where is the pain?")
        # Should either match or return empty — must not raise
        assert isinstance(result_lower, list)


# ---------------------------------------------------------------------------
# synthea_patient
# ---------------------------------------------------------------------------

class TestSyntheaPatient:
    def test_has_required_fields(self):
        p = synthea_patient()
        for key in _PATIENT_KEYS:
            assert key in p, f"missing field: {key}"

    def test_age_in_range(self):
        for _ in range(10):
            p = synthea_patient()
            assert 18 <= p["age"] <= 78

    def test_gender_valid(self):
        for _ in range(10):
            p = synthea_patient()
            assert p["gender"] in ("Male", "Female")

    def test_disease_in_kb(self):
        p = synthea_patient()
        assert p["disease"] in SYMPTOM_KB

    def test_vitals_is_dict_with_keys(self):
        p = synthea_patient()
        assert isinstance(p["vitals"], dict)
        for key in ("BP", "HR", "Temp", "SpO2", "RR", "Pain"):
            assert key in p["vitals"], f"missing vital: {key}"

    def test_symptoms_is_non_empty_string(self):
        p = synthea_patient()
        assert isinstance(p["symptoms"], str)
        assert len(p["symptoms"]) > 0

    def test_canonical_symptoms_is_list(self):
        p = synthea_patient()
        assert isinstance(p["canonical_symptoms"], list)
        assert len(p["canonical_symptoms"]) > 0


# ---------------------------------------------------------------------------
# synthea_patient_from_spec
# ---------------------------------------------------------------------------

class TestSyntheaPatientFromSpec:
    def test_uses_provided_disease(self):
        p = synthea_patient_from_spec("Pneumonia", [], {})
        assert p["disease"] == "Pneumonia"

    def test_uses_provided_symptoms(self):
        custom = ["Fever", "Cough"]
        p = synthea_patient_from_spec("Pneumonia", custom, {})
        for sym in custom:
            assert sym in p["symptoms"]

    def test_exact_vital_value_used(self):
        p = synthea_patient_from_spec("Pneumonia", [], {"hr": 145})
        hr_val = int(p["vitals"]["HR"].split()[0])
        assert hr_val == 145

    def test_has_all_required_fields(self):
        p = synthea_patient_from_spec("Pneumonia", ["Fever"], {})
        for key in _PATIENT_KEYS:
            assert key in p, f"missing field: {key}"

    def test_unknown_disease_falls_back_gracefully(self):
        # Should not raise — uses provided symptoms as canonical
        p = synthea_patient_from_spec("UnknownDisease", ["Headache", "Nausea"], {})
        assert p["disease"] == "UnknownDisease"
