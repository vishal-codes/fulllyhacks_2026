import {
  ApiDiseasesResponse,
  ApiDiseaseDetail,
  ScenarioConfig,
  VitalRanges,
  NewSessionRequest,
  NewSessionResponse,
  ChatRequest,
  ChatResponse,
} from "@/types/scenario";

const BASE_URL = "http://127.0.0.1:8000";

// ─── Fetch all disease names ──────────────────────────────────────────────────

export async function fetchDiseaseList(): Promise<string[]> {
  const res = await fetch(`${BASE_URL}/diseases`);
  if (!res.ok) throw new Error(`Failed to fetch diseases: ${res.status}`);
  const data: ApiDiseasesResponse = await res.json();
  return data.diseases;
}

// ─── Fetch detail for one disease and map to ScenarioConfig ──────────────────

export async function fetchDiseaseConfig(name: string): Promise<ScenarioConfig> {
  const res = await fetch(`${BASE_URL}/diseases/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to fetch disease "${name}": ${res.status}`);
  const data: ApiDiseaseDetail = await res.json();
  return mapApiToConfig(data);
}

// ─── Map backend shape → ScenarioConfig ──────────────────────────────────────

function mapApiToConfig(data: ApiDiseaseDetail): ScenarioConfig {
  const r = data.vitals_ranges;

  // Use a random value within each range as the default
  const rand = (range: { min: number; max: number }) => {
    const raw = range.min + Math.random() * (range.max - range.min);
    // Round to 1 decimal for floats (temp), integer for others
    return Math.round(raw * 10) / 10;
  };

  const vitalRanges: VitalRanges = {
    heartRate:            { min: r.hr.min,      max: r.hr.max,      unit: r.hr.unit },
    bloodPressureSystolic:{ min: r.bp_sys.min,  max: r.bp_sys.max,  unit: r.bp_sys.unit },
    bloodPressureDiastolic:{ min: r.bp_dia.min, max: r.bp_dia.max,  unit: r.bp_dia.unit },
    respiratoryRate:      { min: r.rr.min,       max: r.rr.max,      unit: r.rr.unit },
    temperature:          { min: r.temp.min,     max: r.temp.max,    unit: r.temp.unit },
    oxygenSaturation:     { min: r.spo2.min,     max: r.spo2.max,    unit: r.spo2.unit },
    ...(r.pain ? { pain: { min: r.pain.min, max: r.pain.max, unit: r.pain.unit } } : {}),
  };

  return {
    vitals: {
      heartRate:             rand(r.hr),
      bloodPressureSystolic: rand(r.bp_sys),
      bloodPressureDiastolic:rand(r.bp_dia),
      respiratoryRate:       rand(r.rr),
      temperature:           rand(r.temp),
      oxygenSaturation:      rand(r.spo2),
      ...(r.pain ? { pain: rand(r.pain) } : {}),
    },
    vitalRanges,
    symptoms: data.symptoms.map((label, i) => ({
      id: `symptom-${i}`,
      label,
      present: true,
      severity: "moderate" as const,
    })),
    treatments: data.treatments,
  };
}

// ─── Create a new session ─────────────────────────────────────────────────────

/**
 * POST /session/new
 * Sends disease name, active symptoms, and flat vitals values from the editor.
 * Returns a session_id used to identify the conversation.
 */
export async function createSession(
  config: ScenarioConfig | null,
  diseaseName: string,
  difficulty: "easy" | "medium" | "hard" = "easy"
): Promise<NewSessionResponse> {
  const body: NewSessionRequest = { difficulty };

  if (diseaseName && diseaseName !== "Custom Scenario") {
    body.disease = diseaseName;
  }

  if (config) {
    // Only send symptoms that are toggled present
    const activeSymptoms = config.symptoms
      .filter((s) => s.present)
      .map((s) => s.label);
    if (activeSymptoms.length > 0) body.symptoms = activeSymptoms;

    // Send flat vitals values the doctor set in the UI
    const v = config.vitals;
    const vitals: Record<string, number> = {
      hr:     v.heartRate,
      bp_sys: v.bloodPressureSystolic,
      bp_dia: v.bloodPressureDiastolic,
      rr:     v.respiratoryRate,
      temp:   v.temperature,
      spo2:   v.oxygenSaturation,
    };
    if (v.pain !== undefined) vitals.pain = v.pain;
    body.vitals = vitals;
  }

  const res = await fetch(`${BASE_URL}/session/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
  return res.json() as Promise<NewSessionResponse>;
}

// ─── Send a chat message ──────────────────────────────────────────────────────

/**
 * POST /session/chat
 * Sends a student message to the virtual patient for the active session.
 */
export async function sendChatMessage(
  message: string,
  maxNewTokens = 120
): Promise<ChatResponse> {
  const body: ChatRequest = { message, max_new_tokens: maxNewTokens };

  const res = await fetch(`${BASE_URL}/session/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Chat request failed: ${res.status}${body ? ` — ${body}` : ""}`);
  }
  return res.json() as Promise<ChatResponse>;
}
