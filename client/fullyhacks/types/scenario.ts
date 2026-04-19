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
  difficulty?: "easy" | "medium" | "hard";
}

/** Response from POST /session/new — backend returns patient info with formatted vitals */
export interface NewSessionResponse {
  name: string;
  age: number;
  gender: string;
  disease: string;
  /** Formatted vitals strings e.g. { BP: "120/80 mmHg", HR: "88 bpm", Temp: "37.2C", SpO2: "97%", RR: "16 breaths/min", Pain: "3/10" } */
  vitals: Record<string, string | number>;
  session_id: string;
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

export interface EndSessionResponse {
  patient: {
    name: string;
    age: number;
    gender: string;
    mrn?: string;
    disease: string;
    onset?: string;
    history?: string;
  };
  vitals: Record<string, string | number>;
  transcript: Array<{
    turn: number;
    doctor: string;
    patient: string;
  }>;
  symptoms: {
    canonical: string[];
    revealed: string[];
    coverage_pct: number;
  };
  osce_report?: Record<string, unknown>;
  counterfactual?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CompetitionStatusResponse {
  competition_date: string;
  has_started: boolean;
  has_completed: boolean;
  attempt?: {
    id: string;
    session_id: string;
    correct_diagnosis?: boolean | null;
    started_at: string;
    ended_at?: string | null;
  } | null;
  patient_preview: {
    name: string;
    age: number;
    gender: string;
  };
}

export interface CompetitionStartResponse {
  session_id: string;
  competition_date: string;
  name: string;
  age: number;
  gender: string;
  vitals: Record<string, string | number>;
}
