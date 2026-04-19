# ClinicVerse — AI-Powered Virtual Patient for Medical Training

ClinicVerse lets medical students practice clinical consultations with a realistic AI patient — and then receive an examiner-grade report on their performance, the same way an OSCE does.

---

## The Problem

Medical students get very few opportunities to practice real patient consultations before they face them on real people. Standardised patient programmes are expensive to run, hard to scale, and give limited feedback. Most students walk into their first OSCE having rehearsed on classmates or paper cases.

MedSim gives every student an on-demand, realistic consultation to practice with — available any time, for any disease, at any difficulty.

---

## What It Does

A teacher selects a disease from a library of 50+ NHS conditions and can adjust the patient's symptom set and vital sign ranges before the session starts. Students then open a conversation with the AI patient and conduct a clinical history just as they would in an exam — asking about onset, character, severity, associated symptoms, past history, medications, and anything else they choose.

The patient responds naturally, reveals information only when asked the right questions, and behaves differently depending on the difficulty level set.

When the student ends the session, the system generates a full **OSCE-style evaluation report** scored across four domains:

- **History Taking** — how systematically they covered the presenting complaint, past history, social history, medications, and allergies
- **Clinical Reasoning** — whether their questions logically narrowed toward the correct diagnosis
- **Communication** — language clarity, question structure, empathy, and consultation flow
- **Final Diagnosis** — what disease the student diagnosed (extracted from the conversation), scored against the ground truth

The report also includes a **counterfactual analysis**: specific high-value questions the student should have asked but didn't, and the ideal order to ask them — built for active learning, not just grading.

---

## What Makes It Different

**A fine-tuned patient model, not a generic chatbot.**
The patient is powered by Qwen 2.5-1.5B with a custom LoRA adapter trained on real medical dialogues. It knows to reveal symptoms only when probed, never volunteers a diagnosis, and stays consistent across the conversation. It runs entirely on a laptop — no GPU infrastructure needed.

**RAG-grounded answers.**
Every doctor question is matched against the disease's canonical symptom set via per-turn retrieval. The patient only mentions symptoms that are clinically valid for the disease being simulated, not hallucinated ones.

**Difficulty levels that change patient behaviour.**
- *Easy* — calm, cooperative, answers directly
- *Medium* — anxious, vague on timelines, sometimes needs a follow-up before giving a full answer
- *Hard* — distressed, minimises symptoms, contradicts themselves on dates, deflects with self-diagnosis ("I already Googled it, I think it's just stress")

**OSCE scoring by a second LLM.**
The evaluation is done by Groq's Llama 3.3-70B, which reads the full transcript, extracts the student's diagnosis and any prescriptions from anywhere in the conversation, and scores each domain with written examiner feedback — not a keyword check.

**Daily competition cases.**
Each day a new patient case rotates in. Students compete on the same case and are ranked by their OSCE score on a live leaderboard.

**Voice-first interaction.**
The consultation can be conducted entirely by voice using ElevenLabs real-time speech-to-text and text-to-speech, making it feel closer to an actual clinical encounter.

---

## Tech

| Layer | Stack |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Auth | NextAuth + Google OAuth |
| Backend | FastAPI, Python 3.13, Uvicorn |
| Patient LLM | Qwen 2.5-1.5B + LoRA (runs on MPS / CPU) |
| Evaluator LLM | Groq — llama-3.3-70b-versatile |
| Speech | ElevenLabs Scribe v2 (STT) + TTS |
| Database | Neon Postgres |
| Knowledge Base | 50+ NHS conditions with symptoms, treatments, and vital sign ranges |

---

## Running Locally

**Backend**
```bash
cd server
echo "GROQ_API_KEY=your_key" > .env
uv run uvicorn app:app --reload --port 8000
```

**Frontend**
```bash
cd client/fullyhacks
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> The patient model downloads ~3 GB of base weights on first startup. After that it stays in memory for the lifetime of the server process.
