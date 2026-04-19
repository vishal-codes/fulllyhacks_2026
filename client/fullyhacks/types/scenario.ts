// ─── Internal app types ───────────────────────────────────────────────────────

export interface VitalRange {
  min: number;
  max: number;
  unit: string;
}

export interface Vitals {
  heartRate: number;
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  respiratoryRate: number;
  temperature: number;      // °C (from backend)
  oxygenSaturation: number; // %
  pain?: number;            // /10
}

export interface VitalRanges {
  heartRate: VitalRange;
  bloodPressureSystolic: VitalRange;
  bloodPressureDiastolic: VitalRange;
  respiratoryRate: VitalRange;
  temperature: VitalRange;
  oxygenSaturation: VitalRange;
  pain?: VitalRange;
}

export interface Symptom {
  id: string;
  label: string;
  present: boolean;
  severity: "mild" | "moderate" | "severe";
}

export interface ScenarioConfig {
  vitals: Vitals;
  vitalRanges?: VitalRanges;
  symptoms: Symptom[];
  treatments?: string[];
}

export interface DiseaseScenario {
  id: string;
  name: string;
  defaultConfig: ScenarioConfig;
  patientProfile?: {
    age?: number;
    gender?: string;
    occupation?: string;
  };
  hiddenClues?: string[];
  expectedQuestions?: string[];
  reportHints?: string[];
}

// ─── Backend API response shapes ──────────────────────────────────────────────

export interface ApiDiseasesResponse {
  diseases: string[];
}

export interface ApiVitalsRanges {
  bp_sys:  { min: number; max: number; unit: string };
  bp_dia:  { min: number; max: number; unit: string };
  hr:      { min: number; max: number; unit: string };
  temp:    { min: number; max: number; unit: string };
  spo2:    { min: number; max: number; unit: string };
  rr:      { min: number; max: number; unit: string };
  pain?:   { min: number; max: number; unit: string };
}

export interface ApiDiseaseDetail {
  disease: string;
  symptoms: string[];
  treatments: string[];
  vitals_ranges: ApiVitalsRanges;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/** Body sent to POST /session/new */
export interface NewSessionRequest {
  disease?: string;
  symptoms?: string[];
  vitals?: Record<string, number>;
}

/** Response from POST /session/new — backend returns patient info, not a session_id */
export interface NewSessionResponse {
  name: string;
  age: number;
  gender: string;
  disease: string;
  vitals: Record<string, number>;
  session_id?: string; // may be added in future
  [key: string]: unknown;
}

/** Body sent to POST /session/chat */
export interface ChatRequest {
  message: string;
  max_new_tokens?: number;
}

/** Response from POST /session/chat */
export interface ChatResponse {
  response: string;
  [key: string]: unknown;
}
