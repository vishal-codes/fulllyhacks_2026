export interface Vitals {
  heartRate: number;        // bpm
  bloodPressureSystolic: number;
  bloodPressureDiastolic: number;
  respiratoryRate: number;  // breaths/min
  temperature: number;      // °F
  oxygenSaturation: number; // %
}

export interface Symptom {
  id: string;
  label: string;
  present: boolean;
  severity: "mild" | "moderate" | "severe";
}

export interface ScenarioConfig {
  vitals: Vitals;
  symptoms: Symptom[];
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
