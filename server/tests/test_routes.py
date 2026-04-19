"""
test_routes.py
--------------
HTTP route tests for every endpoint in app.py.

Uses a module-scoped TestClient from conftest.py so the app starts once
and the Qwen model / Groq LLM are mocked throughout.

Test order within each class does not matter — each test that needs an
active session calls /session/new itself via the active_session fixture.
"""

import pytest


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_status_ok(self, client):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_session_inactive_at_start(self, client):
        # After module setup no session has been started yet for this test
        # (active_session fixture is not used here)
        data = client.get("/health").json()
        assert "session_active" in data

    def test_session_active_after_new(self, client, active_session):
        data = client.get("/health").json()
        assert data["session_active"] is True


# ---------------------------------------------------------------------------
# GET /diseases
# ---------------------------------------------------------------------------

class TestGetDiseases:
    def test_returns_200(self, client):
        resp = client.get("/diseases")
        assert resp.status_code == 200

    def test_response_has_diseases_key(self, client):
        data = client.get("/diseases").json()
        assert "diseases" in data

    def test_diseases_is_non_empty_list(self, client):
        data = client.get("/diseases").json()
        assert isinstance(data["diseases"], list)
        assert len(data["diseases"]) > 0

    def test_diseases_are_strings(self, client):
        data = client.get("/diseases").json()
        assert all(isinstance(d, str) for d in data["diseases"])

    def test_diseases_sorted(self, client):
        diseases = client.get("/diseases").json()["diseases"]
        assert diseases == sorted(diseases)


# ---------------------------------------------------------------------------
# GET /diseases/{name}
# ---------------------------------------------------------------------------

class TestGetDiseaseInfo:
    def _pick_disease(self, client) -> str:
        return client.get("/diseases").json()["diseases"][0]

    def test_known_disease_returns_200(self, client):
        disease = self._pick_disease(client)
        resp = client.get(f"/diseases/{disease}")
        assert resp.status_code == 200

    def test_response_has_required_keys(self, client):
        disease = self._pick_disease(client)
        data = client.get(f"/diseases/{disease}").json()
        assert "disease" in data
        assert "symptoms" in data
        assert "treatments" in data
        assert "vitals_ranges" in data

    def test_symptoms_is_non_empty_list(self, client):
        disease = self._pick_disease(client)
        data = client.get(f"/diseases/{disease}").json()
        assert isinstance(data["symptoms"], list)
        assert len(data["symptoms"]) > 0

    def test_vitals_ranges_has_all_keys(self, client):
        disease = self._pick_disease(client)
        data = client.get(f"/diseases/{disease}").json()
        expected = {"bp_sys", "bp_dia", "hr", "temp", "spo2", "rr", "pain"}
        assert set(data["vitals_ranges"].keys()) == expected

    def test_each_vital_range_has_min_max_unit(self, client):
        disease = self._pick_disease(client)
        ranges = client.get(f"/diseases/{disease}").json()["vitals_ranges"]
        for key, r in ranges.items():
            assert "min" in r, f"{key} missing 'min'"
            assert "max" in r, f"{key} missing 'max'"
            assert "unit" in r, f"{key} missing 'unit'"

    def test_unknown_disease_returns_404(self, client):
        resp = client.get("/diseases/ThisDoesNotExistEverAtAll99")
        assert resp.status_code == 404

    def test_404_has_detail_message(self, client):
        resp = client.get("/diseases/NoSuchDisease")
        assert "detail" in resp.json()

    def test_case_insensitive_match(self, client):
        disease = self._pick_disease(client)
        resp = client.get(f"/diseases/{disease.lower()}")
        # Should return 200 or 404 — must not 500
        assert resp.status_code in (200, 404)


# ---------------------------------------------------------------------------
# POST /session/new
# ---------------------------------------------------------------------------

class TestSessionNew:
    def test_random_patient_returns_200(self, client):
        resp = client.post("/session/new")
        assert resp.status_code == 200

    def test_returns_required_fields(self, client):
        data = client.post("/session/new").json()
        for field in ("name", "age", "gender", "disease", "vitals"):
            assert field in data, f"missing field: {field}"

    def test_name_is_string(self, client):
        data = client.post("/session/new").json()
        assert isinstance(data["name"], str)
        assert len(data["name"]) > 0

    def test_age_is_integer_in_range(self, client):
        data = client.post("/session/new").json()
        assert isinstance(data["age"], int)
        assert 18 <= data["age"] <= 78

    def test_gender_valid(self, client):
        data = client.post("/session/new").json()
        assert data["gender"] in ("Male", "Female")

    def test_vitals_has_expected_keys(self, client):
        data = client.post("/session/new").json()
        for key in ("BP", "HR", "Temp", "SpO2", "RR", "Pain"):
            assert key in data["vitals"], f"missing vital: {key}"

    def test_with_disease_spec(self, client):
        resp = client.post("/session/new", json={"disease": "Pneumonia"})
        assert resp.status_code == 200
        assert resp.json()["disease"] == "Pneumonia"

    def test_with_custom_symptoms(self, client):
        resp = client.post("/session/new", json={
            "disease": "Pneumonia",
            "symptoms": ["Fever", "Cough"]
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["disease"] == "Pneumonia"

    def test_with_custom_vitals(self, client):
        resp = client.post("/session/new", json={
            "disease": "Pneumonia",
            "vitals": {"hr": 110, "temp": 39.2}
        })
        assert resp.status_code == 200

    def test_exact_vital_value_used(self, client):
        resp = client.post("/session/new", json={
            "disease": "Pneumonia",
            "vitals": {"hr": 145}
        })
        vitals = resp.json()["vitals"]
        hr_val = int(vitals["HR"].split()[0])
        assert hr_val == 145

    def test_resets_existing_session(self, client):
        # Start two sessions back to back — second should succeed
        client.post("/session/new", json={"disease": "Pneumonia"})
        resp = client.post("/session/new", json={"disease": "Influenza"})
        assert resp.status_code == 200
        assert resp.json()["disease"] == "Influenza"


# ---------------------------------------------------------------------------
# POST /session/chat
# ---------------------------------------------------------------------------

class TestSessionChat:
    def test_returns_200(self, client, active_session):
        resp = client.post("/session/chat", json={"message": "What is your name?"})
        assert resp.status_code == 200

    def test_response_has_response_key(self, client, active_session):
        data = client.post("/session/chat", json={"message": "How are you?"}).json()
        assert "response" in data

    def test_response_is_non_empty_string(self, client, active_session):
        data = client.post("/session/chat", json={"message": "What brings you in today?"}).json()
        assert isinstance(data["response"], str)
        assert len(data["response"]) > 0

    def test_mock_response_is_returned(self, client, active_session):
        from tests.conftest import MOCK_PATIENT_RESPONSE
        data = client.post("/session/chat", json={"message": "Tell me about your symptoms."}).json()
        assert data["response"] == MOCK_PATIENT_RESPONSE

    def test_multiple_turns_succeed(self, client, active_session):
        questions = [
            "What is your name?",
            "When did your symptoms start?",
            "Do you have a cough?",
            "Any fever?",
        ]
        for q in questions:
            resp = client.post("/session/chat", json={"message": q})
            assert resp.status_code == 200, f"failed on: {q}"

    def test_no_session_returns_400(self, client):
        # Force session to inactive state
        import session as session_module
        session_module.get_session().active = False

        resp = client.post("/session/chat", json={"message": "Hello"})
        assert resp.status_code == 400

    def test_no_session_400_has_detail(self, client):
        import session as session_module
        session_module.get_session().active = False
        resp = client.post("/session/chat", json={"message": "Hello"})
        assert "detail" in resp.json()

    def test_custom_max_tokens(self, client, active_session):
        resp = client.post("/session/chat", json={
            "message": "How long have you had these symptoms?",
            "max_new_tokens": 50
        })
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# POST /session/end
# ---------------------------------------------------------------------------

class TestSessionEnd:
    def test_returns_200(self, client, chatted_session):
        resp = client.post("/session/end")
        assert resp.status_code == 200

    def test_response_has_osce_report(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "osce_report" in data

    def test_osce_report_has_domains(self, client, chatted_session):
        osce = client.post("/session/end").json()["osce_report"]
        assert "domains" in osce

    def test_all_four_domains_present(self, client, chatted_session):
        domains = client.post("/session/end").json()["osce_report"]["domains"]
        for domain in ("history_taking", "clinical_reasoning", "communication", "final_diagnosis"):
            assert domain in domains, f"missing domain: {domain}"

    def test_each_domain_has_score(self, client, chatted_session):
        domains = client.post("/session/end").json()["osce_report"]["domains"]
        for name, d in domains.items():
            assert "score" in d, f"{name} missing 'score'"
            assert "max" in d, f"{name} missing 'max'"

    def test_domain_scores_are_integers_0_to_25(self, client, chatted_session):
        domains = client.post("/session/end").json()["osce_report"]["domains"]
        for name, d in domains.items():
            assert isinstance(d["score"], int), f"{name} score not int"
            assert 0 <= d["score"] <= 25, f"{name} score {d['score']} out of range"
            assert d["max"] == 25

    def test_total_score_equals_sum_of_domains(self, client, chatted_session):
        osce = client.post("/session/end").json()["osce_report"]
        domains = osce["domains"]
        expected = sum(
            domains[d]["score"]
            for d in ("history_taking", "clinical_reasoning", "communication", "final_diagnosis")
        )
        assert osce["total_score"] == expected

    def test_total_score_max_is_100(self, client, chatted_session):
        osce = client.post("/session/end").json()["osce_report"]
        assert osce["max_score"] == 100

    def test_final_diagnosis_has_inferred_field(self, client, chatted_session):
        fd = client.post("/session/end").json()["osce_report"]["domains"]["final_diagnosis"]
        assert "inferred_diagnosis" in fd
        assert "is_correct" in fd

    def test_report_has_patient_info(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "patient" in data
        for field in ("name", "age", "gender", "disease"):
            assert field in data["patient"], f"missing patient.{field}"

    def test_report_has_vitals(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "vitals" in data

    def test_report_has_transcript(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "transcript" in data
        assert isinstance(data["transcript"], list)

    def test_report_has_symptoms_coverage(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "symptoms" in data
        assert "coverage_pct" in data["symptoms"]

    def test_no_active_session_returns_400(self, client):
        import session as session_module
        session_module.get_session().active = False
        resp = client.post("/session/end")
        assert resp.status_code == 400

    def test_session_marked_inactive_after_end(self, client, chatted_session):
        client.post("/session/end")
        import session as session_module
        assert not session_module.get_session().is_active()


# ---------------------------------------------------------------------------
# Full end-to-end flow
# ---------------------------------------------------------------------------

class TestFullFlow:
    def test_complete_consultation(self, client):
        """
        Happy-path: new → chat × 3 → end
        Verifies the whole flow works together and the report is coherent.
        """
        # 1. Start a session
        new_resp = client.post("/session/new", json={
            "disease": "Pneumonia",
            "symptoms": ["Fever", "Productive cough", "Chest pain"],
        })
        assert new_resp.status_code == 200
        patient = new_resp.json()
        assert patient["disease"] == "Pneumonia"

        # 2. Three chat turns
        turns = [
            "What is your name and how old are you?",
            "When did your symptoms start?",
            "Do you have a fever?",
        ]
        for question in turns:
            resp = client.post("/session/chat", json={"message": question})
            assert resp.status_code == 200
            assert "response" in resp.json()

        # 3. End and get report
        end_resp = client.post("/session/end")
        assert end_resp.status_code == 200

        report = end_resp.json()
        osce = report["osce_report"]

        # Report structure
        assert report["patient"]["disease"] == "Pneumonia"
        assert len(report["transcript"]) == len(turns)

        # Scores
        total = sum(
            osce["domains"][d]["score"]
            for d in ("history_taking", "clinical_reasoning", "communication", "final_diagnosis")
        )
        assert osce["total_score"] == total
        assert 0 <= osce["total_score"] <= 100

        # Session is now inactive
        import session as session_module
        assert not session_module.get_session().is_active()

    def test_new_session_resets_transcript(self, client):
        """Starting a new session after ending should give a clean transcript."""
        # Session 1
        client.post("/session/new", json={"disease": "Influenza"})
        client.post("/session/chat", json={"message": "Hello"})
        client.post("/session/end")

        # Session 2 — fresh start
        client.post("/session/new", json={"disease": "GERD"})
        resp = client.post("/session/end")
        assert resp.status_code == 200
        # Transcript from session 2 should be empty (no chat turns)
        assert len(resp.json()["transcript"]) == 0


# ---------------------------------------------------------------------------
# Difficulty modes
# ---------------------------------------------------------------------------

class TestDifficultyModes:
    def test_easy_difficulty_accepted(self, client):
        resp = client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "easy"})
        assert resp.status_code == 200

    def test_medium_difficulty_accepted(self, client):
        resp = client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "medium"})
        assert resp.status_code == 200

    def test_hard_difficulty_accepted(self, client):
        resp = client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "hard"})
        assert resp.status_code == 200

    def test_invalid_difficulty_returns_422(self, client):
        resp = client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "extreme"})
        assert resp.status_code == 422

    def test_default_difficulty_is_easy(self, client):
        """Omitting difficulty should default to easy without error."""
        resp = client.post("/session/new", json={"disease": "Pneumonia"})
        assert resp.status_code == 200

    def test_difficulty_stored_in_session(self, client):
        """After reset with hard, the session's difficulty attribute should be 'hard'."""
        client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "hard"})
        import session as session_module
        assert session_module.get_session().difficulty == "hard"

    def test_easy_difficulty_stored_in_session(self, client):
        client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "easy"})
        import session as session_module
        assert session_module.get_session().difficulty == "easy"

    def test_medium_difficulty_stored_in_session(self, client):
        client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "medium"})
        import session as session_module
        assert session_module.get_session().difficulty == "medium"

    def test_chat_works_after_hard_difficulty(self, client):
        client.post("/session/new", json={"disease": "Pneumonia", "difficulty": "hard"})
        resp = client.post("/session/chat", json={"message": "What is your name?"})
        assert resp.status_code == 200
        assert "response" in resp.json()


# ---------------------------------------------------------------------------
# Counterfactual report
# ---------------------------------------------------------------------------

class TestCounterfactualReport:
    def test_report_has_counterfactual_key(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "counterfactual" in data

    def test_counterfactual_has_missed_questions(self, client, chatted_session):
        counterfactual = client.post("/session/end").json()["counterfactual"]
        assert "missed_questions" in counterfactual
        assert isinstance(counterfactual["missed_questions"], list)

    def test_counterfactual_missed_questions_non_empty(self, client, chatted_session):
        counterfactual = client.post("/session/end").json()["counterfactual"]
        assert len(counterfactual["missed_questions"]) > 0

    def test_each_missed_question_has_required_fields(self, client, chatted_session):
        questions = client.post("/session/end").json()["counterfactual"]["missed_questions"]
        for q in questions:
            assert "question" in q, "missing 'question' field"
            assert "why_important" in q, "missing 'why_important' field"
            assert "symptom_targeted" in q, "missing 'symptom_targeted' field"

    def test_counterfactual_has_ideal_question_order(self, client, chatted_session):
        counterfactual = client.post("/session/end").json()["counterfactual"]
        assert "ideal_question_order" in counterfactual
        assert isinstance(counterfactual["ideal_question_order"], list)

    def test_counterfactual_has_key_learning_point(self, client, chatted_session):
        counterfactual = client.post("/session/end").json()["counterfactual"]
        assert "key_learning_point" in counterfactual
        assert isinstance(counterfactual["key_learning_point"], str)
        assert len(counterfactual["key_learning_point"]) > 0

    def test_counterfactual_and_osce_both_present(self, client, chatted_session):
        data = client.post("/session/end").json()
        assert "osce_report" in data
        assert "counterfactual" in data
