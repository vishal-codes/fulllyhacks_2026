import { DiseaseScenario, ScenarioConfig } from "@/types/scenario";

// ─── Helpers ────────────────────────────────────────────────────────────────

function cfg(
  vitals: ScenarioConfig["vitals"],
  symptoms: { id: string; label: string; present?: boolean; severity?: "mild" | "moderate" | "severe" }[]
): ScenarioConfig {
  return {
    vitals,
    symptoms: symptoms.map((s) => ({
      id: s.id,
      label: s.label,
      present: s.present ?? true,
      severity: s.severity ?? "moderate",
    })),
  };
}

// ─── Scenarios ──────────────────────────────────────────────────────────────

export const PREDEFINED_DISEASES: DiseaseScenario[] = [
  // ── Respiratory ────────────────────────────────────────────────────────────
  {
    id: "asthma",
    name: "Asthma",
    defaultConfig: cfg(
      { heartRate: 98, bloodPressureSystolic: 128, bloodPressureDiastolic: 82, respiratoryRate: 22, temperature: 98.6, oxygenSaturation: 94 },
      [
        { id: "wheezing",        label: "Wheezing" },
        { id: "shortness",       label: "Shortness of breath", severity: "moderate" },
        { id: "chest-tightness", label: "Chest tightness",     severity: "mild" },
        { id: "cough",           label: "Dry cough",           severity: "mild" },
        { id: "nocturnal",       label: "Nocturnal symptoms",  present: false, severity: "mild" },
      ]
    ),
  },
  {
    id: "pneumonia",
    name: "Pneumonia",
    defaultConfig: cfg(
      { heartRate: 108, bloodPressureSystolic: 118, bloodPressureDiastolic: 76, respiratoryRate: 26, temperature: 102.4, oxygenSaturation: 91 },
      [
        { id: "productive-cough", label: "Productive cough",    severity: "severe" },
        { id: "fever",            label: "Fever / chills",      severity: "severe" },
        { id: "pleuritic-pain",   label: "Pleuritic chest pain",severity: "moderate" },
        { id: "dyspnea",          label: "Dyspnea on exertion", severity: "moderate" },
        { id: "fatigue",          label: "Fatigue",             severity: "moderate" },
      ]
    ),
  },
  {
    id: "copd",
    name: "COPD",
    defaultConfig: cfg(
      { heartRate: 92, bloodPressureSystolic: 135, bloodPressureDiastolic: 85, respiratoryRate: 24, temperature: 98.2, oxygenSaturation: 90 },
      [
        { id: "chronic-cough",   label: "Chronic cough",          severity: "moderate" },
        { id: "sputum",          label: "Increased sputum",       severity: "moderate" },
        { id: "dyspnea",         label: "Dyspnea at rest",        severity: "severe" },
        { id: "barrel-chest",    label: "Barrel chest",           severity: "mild" },
        { id: "pursed-lip",      label: "Pursed-lip breathing",   present: false, severity: "mild" },
      ]
    ),
  },
  {
    id: "bronchitis",
    name: "Bronchitis",
    defaultConfig: cfg(
      { heartRate: 88, bloodPressureSystolic: 122, bloodPressureDiastolic: 78, respiratoryRate: 20, temperature: 99.8, oxygenSaturation: 96 },
      [
        { id: "cough",        label: "Persistent cough",    severity: "moderate" },
        { id: "mucus",        label: "Mucus production",    severity: "moderate" },
        { id: "sore-throat",  label: "Sore throat",         severity: "mild" },
        { id: "fatigue",      label: "Fatigue",             severity: "mild" },
        { id: "low-fever",    label: "Low-grade fever",     present: false, severity: "mild" },
      ]
    ),
  },

  // ── Cardiovascular ─────────────────────────────────────────────────────────
  {
    id: "hypertension",
    name: "Hypertension",
    defaultConfig: cfg(
      { heartRate: 82, bloodPressureSystolic: 162, bloodPressureDiastolic: 98, respiratoryRate: 16, temperature: 98.6, oxygenSaturation: 98 },
      [
        { id: "headache",    label: "Headache",           severity: "moderate" },
        { id: "dizziness",   label: "Dizziness",          severity: "mild" },
        { id: "blurred",     label: "Blurred vision",     present: false, severity: "mild" },
        { id: "palpitations",label: "Palpitations",       present: false, severity: "mild" },
        { id: "nosebleed",   label: "Nosebleed",          present: false, severity: "mild" },
      ]
    ),
  },
  {
    id: "heart-failure",
    name: "Heart Failure",
    defaultConfig: cfg(
      { heartRate: 104, bloodPressureSystolic: 142, bloodPressureDiastolic: 90, respiratoryRate: 22, temperature: 98.4, oxygenSaturation: 92 },
      [
        { id: "dyspnea",      label: "Dyspnea on exertion", severity: "severe" },
        { id: "orthopnea",    label: "Orthopnea",           severity: "moderate" },
        { id: "edema",        label: "Peripheral edema",    severity: "moderate" },
        { id: "fatigue",      label: "Fatigue",             severity: "severe" },
        { id: "pnd",          label: "Paroxysmal nocturnal dyspnea", present: false, severity: "moderate" },
      ]
    ),
  },
  {
    id: "angina",
    name: "Angina",
    defaultConfig: cfg(
      { heartRate: 90, bloodPressureSystolic: 148, bloodPressureDiastolic: 92, respiratoryRate: 18, temperature: 98.6, oxygenSaturation: 97 },
      [
        { id: "chest-pain",   label: "Chest pain / pressure", severity: "moderate" },
        { id: "radiation",    label: "Pain radiating to arm",  present: false, severity: "moderate" },
        { id: "diaphoresis",  label: "Diaphoresis",            present: false, severity: "mild" },
        { id: "nausea",       label: "Nausea",                 present: false, severity: "mild" },
        { id: "exertional",   label: "Exertional onset",       severity: "moderate" },
      ]
    ),
  },

  // ── Metabolic / Endocrine ──────────────────────────────────────────────────
  {
    id: "diabetes",
    name: "Diabetes",
    defaultConfig: cfg(
      { heartRate: 84, bloodPressureSystolic: 132, bloodPressureDiastolic: 84, respiratoryRate: 16, temperature: 98.6, oxygenSaturation: 98 },
      [
        { id: "polyuria",    label: "Polyuria",           severity: "moderate" },
        { id: "polydipsia",  label: "Polydipsia",         severity: "moderate" },
        { id: "polyphagia",  label: "Polyphagia",         severity: "mild" },
        { id: "fatigue",     label: "Fatigue",            severity: "moderate" },
        { id: "blurred",     label: "Blurred vision",     present: false, severity: "mild" },
      ]
    ),
  },
  {
    id: "hypothyroidism",
    name: "Hypothyroidism",
    defaultConfig: cfg(
      { heartRate: 58, bloodPressureSystolic: 118, bloodPressureDiastolic: 76, respiratoryRate: 14, temperature: 97.2, oxygenSaturation: 98 },
      [
        { id: "fatigue",      label: "Fatigue / lethargy",  severity: "severe" },
        { id: "weight-gain",  label: "Weight gain",         severity: "moderate" },
        { id: "cold-intol",   label: "Cold intolerance",    severity: "moderate" },
        { id: "constipation", label: "Constipation",        severity: "mild" },
        { id: "dry-skin",     label: "Dry skin / hair loss",severity: "mild" },
      ]
    ),
  },
  {
    id: "hyperthyroidism",
    name: "Hyperthyroidism",
    defaultConfig: cfg(
      { heartRate: 112, bloodPressureSystolic: 138, bloodPressureDiastolic: 72, respiratoryRate: 18, temperature: 99.2, oxygenSaturation: 98 },
      [
        { id: "palpitations", label: "Palpitations",        severity: "moderate" },
        { id: "weight-loss",  label: "Unintentional weight loss", severity: "moderate" },
        { id: "heat-intol",   label: "Heat intolerance",    severity: "moderate" },
        { id: "tremor",       label: "Tremor",              severity: "mild" },
        { id: "anxiety",      label: "Anxiety / irritability", severity: "mild" },
      ]
    ),
  },

  // ── Neurological ───────────────────────────────────────────────────────────
  {
    id: "migraine",
    name: "Migraine",
    defaultConfig: cfg(
      { heartRate: 76, bloodPressureSystolic: 124, bloodPressureDiastolic: 80, respiratoryRate: 16, temperature: 98.6, oxygenSaturation: 99 },
      [
        { id: "headache",     label: "Unilateral throbbing headache", severity: "severe" },
        { id: "nausea",       label: "Nausea / vomiting",            severity: "moderate" },
        { id: "photophobia",  label: "Photophobia",                  severity: "moderate" },
        { id: "phonophobia",  label: "Phonophobia",                  severity: "moderate" },
        { id: "aura",         label: "Visual aura",                  present: false, severity: "mild" },
      ]
    ),
  },
  {
    id: "epilepsy",
    name: "Epilepsy",
    defaultConfig: cfg(
      { heartRate: 80, bloodPressureSystolic: 120, bloodPressureDiastolic: 78, respiratoryRate: 16, temperature: 98.6, oxygenSaturation: 98 },
      [
        { id: "seizures",     label: "Recurrent seizures",   severity: "severe" },
        { id: "postictal",    label: "Postictal confusion",  severity: "moderate" },
        { id: "aura",         label: "Pre-seizure aura",     present: false, severity: "mild" },
        { id: "incontinence", label: "Urinary incontinence", present: false, severity: "mild" },
        { id: "fatigue",      label: "Post-event fatigue",   severity: "moderate" },
      ]
    ),
  },
  {
    id: "stroke",
    name: "Stroke",
    defaultConfig: cfg(
      { heartRate: 96, bloodPressureSystolic: 178, bloodPressureDiastolic: 104, respiratoryRate: 20, temperature: 98.8, oxygenSaturation: 95 },
      [
        { id: "facial-droop",  label: "Facial drooping",         severity: "severe" },
        { id: "arm-weakness",  label: "Arm / leg weakness",      severity: "severe" },
        { id: "speech",        label: "Speech difficulty",       severity: "severe" },
        { id: "vision",        label: "Sudden vision loss",      present: false, severity: "severe" },
        { id: "headache",      label: "Sudden severe headache",  present: false, severity: "severe" },
      ]
    ),
  },

  // ── Gastrointestinal ───────────────────────────────────────────────────────
  {
    id: "appendicitis",
    name: "Appendicitis",
    defaultConfig: cfg(
      { heartRate: 102, bloodPressureSystolic: 122, bloodPressureDiastolic: 78, respiratoryRate: 18, temperature: 101.2, oxygenSaturation: 98 },
      [
        { id: "rlq-pain",    label: "RLQ abdominal pain",   severity: "severe" },
        { id: "nausea",      label: "Nausea / vomiting",    severity: "moderate" },
        { id: "anorexia",    label: "Anorexia",             severity: "moderate" },
        { id: "rebound",     label: "Rebound tenderness",   severity: "severe" },
        { id: "fever",       label: "Low-grade fever",      severity: "mild" },
      ]
    ),
  },
  {
    id: "gerd",
    name: "GERD",
    defaultConfig: cfg(
      { heartRate: 74, bloodPressureSystolic: 120, bloodPressureDiastolic: 76, respiratoryRate: 16, temperature: 98.6, oxygenSaturation: 99 },
      [
        { id: "heartburn",   label: "Heartburn",            severity: "moderate" },
        { id: "regurgitation",label: "Acid regurgitation",  severity: "moderate" },
        { id: "dysphagia",   label: "Dysphagia",            present: false, severity: "mild" },
        { id: "chest-pain",  label: "Non-cardiac chest pain",present: false, severity: "mild" },
        { id: "cough",       label: "Chronic cough",        severity: "mild" },
      ]
    ),
  },
  {
    id: "ibs",
    name: "IBS",
    defaultConfig: cfg(
      { heartRate: 76, bloodPressureSystolic: 118, bloodPressureDiastolic: 74, respiratoryRate: 16, temperature: 98.6, oxygenSaturation: 99 },
      [
        { id: "abdominal-pain", label: "Abdominal cramping",   severity: "moderate" },
        { id: "bloating",       label: "Bloating",             severity: "moderate" },
        { id: "diarrhea",       label: "Diarrhea",             severity: "moderate" },
        { id: "constipation",   label: "Constipation",         present: false, severity: "moderate" },
        { id: "mucus",          label: "Mucus in stool",       present: false, severity: "mild" },
      ]
    ),
  },

  // ── Musculoskeletal / Other ────────────────────────────────────────────────
  {
    id: "gout",
    name: "Gout",
    defaultConfig: cfg(
      { heartRate: 86, bloodPressureSystolic: 138, bloodPressureDiastolic: 88, respiratoryRate: 16, temperature: 99.4, oxygenSaturation: 98 },
      [
        { id: "joint-pain",  label: "Acute joint pain",     severity: "severe" },
        { id: "swelling",    label: "Joint swelling",       severity: "severe" },
        { id: "redness",     label: "Erythema over joint",  severity: "moderate" },
        { id: "warmth",      label: "Warmth over joint",    severity: "moderate" },
        { id: "tophi",       label: "Tophi deposits",       present: false, severity: "mild" },
      ]
    ),
  },
  {
    id: "anemia",
    name: "Anemia",
    defaultConfig: cfg(
      { heartRate: 100, bloodPressureSystolic: 108, bloodPressureDiastolic: 68, respiratoryRate: 18, temperature: 98.2, oxygenSaturation: 96 },
      [
        { id: "fatigue",     label: "Fatigue / weakness",   severity: "severe" },
        { id: "pallor",      label: "Pallor",               severity: "moderate" },
        { id: "dyspnea",     label: "Dyspnea on exertion",  severity: "moderate" },
        { id: "palpitations",label: "Palpitations",         severity: "mild" },
        { id: "dizziness",   label: "Dizziness",            severity: "mild" },
      ]
    ),
  },
];
