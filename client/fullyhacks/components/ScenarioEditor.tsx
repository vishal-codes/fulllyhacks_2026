"use client";

import { useState } from "react";
import { ScenarioConfig, Symptom, Vitals } from "@/types/scenario";

interface Props {
  diseaseName: string;
  config: ScenarioConfig;
  isCustom?: boolean;
  onChange: (updated: ScenarioConfig) => void;
  onRenameDisease?: (name: string) => void;
}

const FONT = "'Gochi Hand', cursive";

const inputBase: React.CSSProperties = {
  background: "rgba(250,250,250,0.08)",
  border: "1px solid rgba(255,255,255,0.25)",
  color: "#FAFAFA",
  fontFamily: FONT,
  fontSize: "18px",
  outline: "none",
  borderRadius: "8px",
  padding: "6px 12px",
  width: "100%",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

function focusInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "#00A6FF";
  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(0,166,255,0.2)";
}
function blurInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
  e.currentTarget.style.boxShadow = "none";
}

// ─── VitalField ───────────────────────────────────────────────────────────────

function VitalField({
  label, unit, value, min, max, range, onChange,
}: {
  label: string; unit: string; value: number;
  min: number; max: number;
  range?: { min: number; max: number };
  onChange: (v: number) => void;
}) {
  const clampMin = range ? range.min : min;
  const clampMax = range ? range.max : max;

  function handleChange(raw: number) {
    if (isNaN(raw)) return;
    onChange(Math.round(Math.min(clampMax, Math.max(clampMin, raw)) * 10) / 10);
  }

  return (
    <div className="flex flex-col gap-1">
      <label style={{ color: "rgba(250,250,250,0.6)", fontFamily: FONT, fontSize: "16px" }}>
        {label}
        <span className="ml-1" style={{ color: "rgba(250,250,250,0.35)", fontSize: "14px" }}>({unit})</span>
      </label>
      <input
        type="number"
        value={value === 0 ? "" : value}
        min={clampMin}
        max={clampMax}
        step="0.1"
        placeholder="—"
        onChange={(e) => handleChange(Number(e.target.value))}
        style={inputBase}
        onFocus={focusInput}
        onBlur={blurInput}
      />
      {range && (
        <span style={{ color: "rgba(250,250,250,0.25)", fontFamily: FONT, fontSize: "13px" }}>
          Range: {range.min} – {range.max}
        </span>
      )}
    </div>
  );
}

// ─── SymptomRow ───────────────────────────────────────────────────────────────

function SymptomRow({
  symptom, onChange, onRemove,
}: {
  symptom: Symptom;
  onChange: (updated: Symptom) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{
        background: symptom.present ? "rgba(0,166,255,0.12)" : "rgba(250,250,250,0.05)",
        border: `1px solid ${symptom.present ? "rgba(0,166,255,0.4)" : "rgba(255,255,255,0.12)"}`,
      }}
    >
      <button
        type="button"
        aria-label={symptom.present ? "Mark absent" : "Mark present"}
        onClick={() => onChange({ ...symptom, present: !symptom.present })}
        className="flex-shrink-0 w-5 h-5 rounded border transition-all flex items-center justify-center"
        style={{
          background: symptom.present ? "#00A6FF" : "transparent",
          borderColor: symptom.present ? "#FAFAFA" : "rgba(255,255,255,0.3)",
        }}
      >
        {symptom.present && <span style={{ color: "#FAFAFA", fontSize: "11px", lineHeight: 1 }}>✓</span>}
      </button>

      <span className="flex-1" style={{ color: symptom.present ? "#FAFAFA" : "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "18px" }}>
        {symptom.label}
      </span>

      <button
        type="button"
        aria-label="Remove symptom"
        onClick={onRemove}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all"
        style={{ color: "rgba(250,250,250,0.3)", fontSize: "12px" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(250,250,250,0.3)"; }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── AddSymptomRow ────────────────────────────────────────────────────────────

function AddSymptomRow({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");

  function commit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
  }

  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
        placeholder="New symptom name…"
        style={{ ...inputBase, flex: 1 }}
        onFocus={focusInput}
        onBlur={blurInput}
      />
      <button
        type="button"
        onClick={commit}
        className="px-4 py-1.5 rounded-lg transition-all"
        style={{
          background: "#00A6FF",
          border: "1px solid #FAFAFA",
          color: "#FAFAFA",
          fontFamily: FONT,
          fontSize: "18px",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        Add
      </button>
    </div>
  );
}

// ─── ScenarioEditor ───────────────────────────────────────────────────────────

export default function ScenarioEditor({
  diseaseName, config, isCustom = false, onChange, onRenameDisease,
}: Props) {
  function updateVital<K extends keyof Vitals>(key: K, value: number) {
    onChange({ ...config, vitals: { ...config.vitals, [key]: value } });
  }

  function updateSymptom(updated: Symptom) {
    onChange({ ...config, symptoms: config.symptoms.map((s) => s.id === updated.id ? updated : s) });
  }

  function removeSymptom(id: string) {
    onChange({ ...config, symptoms: config.symptoms.filter((s) => s.id !== id) });
  }

  function addSymptom(label: string) {
    onChange({
      ...config,
      symptoms: [...config.symptoms, { id: `custom-${Date.now()}`, label, present: true, severity: "moderate" }],
    });
  }

  return (
    <div
      className="flex flex-col gap-5"
      style={{
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.2) transparent",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        {isCustom && onRenameDisease ? (
          <input
            type="text"
            value={diseaseName}
            onChange={(e) => onRenameDisease(e.target.value)}
            placeholder="Scenario name…"
            style={{ ...inputBase, fontSize: "22px", color: "#FAFAFA", flex: 1 }}
            onFocus={focusInput}
            onBlur={blurInput}
          />
        ) : (
          <h3 style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "22px" }}>
            {diseaseName} — Settings
          </h3>
        )}
      </div>

      {/* Vitals */}
      <section className="flex flex-col gap-3">
        <h4
          className="uppercase tracking-wider"
          style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "14px" }}
        >
          Vitals
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <VitalField label="Heart Rate"   unit={config.vitalRanges?.heartRate.unit ?? "bpm"}  value={config.vitals.heartRate}              min={30}  max={220} range={config.vitalRanges?.heartRate}             onChange={(v) => updateVital("heartRate", v)} />
          <VitalField label="BP Systolic"  unit={config.vitalRanges?.bloodPressureSystolic.unit ?? "mmHg"} value={config.vitals.bloodPressureSystolic}  min={60}  max={250} range={config.vitalRanges?.bloodPressureSystolic}  onChange={(v) => updateVital("bloodPressureSystolic", v)} />
          <VitalField label="BP Diastolic" unit={config.vitalRanges?.bloodPressureDiastolic.unit ?? "mmHg"} value={config.vitals.bloodPressureDiastolic} min={40}  max={150} range={config.vitalRanges?.bloodPressureDiastolic} onChange={(v) => updateVital("bloodPressureDiastolic", v)} />
          <VitalField label="Resp. Rate"   unit={config.vitalRanges?.respiratoryRate.unit ?? "br/m"} value={config.vitals.respiratoryRate}        min={8}   max={40}  range={config.vitalRanges?.respiratoryRate}          onChange={(v) => updateVital("respiratoryRate", v)} />
          <VitalField label="Temperature"  unit={config.vitalRanges?.temperature.unit ?? "°C"}   value={config.vitals.temperature}            min={34}  max={42}  range={config.vitalRanges?.temperature}             onChange={(v) => updateVital("temperature", v)} />
          <VitalField label="O₂ Sat"       unit={config.vitalRanges?.oxygenSaturation.unit ?? "%"}    value={config.vitals.oxygenSaturation}       min={70}  max={100} range={config.vitalRanges?.oxygenSaturation}        onChange={(v) => updateVital("oxygenSaturation", v)} />
          {config.vitalRanges?.pain && (
            <VitalField label="Pain" unit={config.vitalRanges.pain.unit} value={config.vitals.pain ?? 0} min={0} max={10} range={config.vitalRanges.pain} onChange={(v) => updateVital("pain", v)} />
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px" style={{ background: "rgba(255,255,255,0.12)" }} />

      {/* Symptoms */}
      <section className="flex flex-col gap-3">
        <h4
          className="uppercase tracking-wider"
          style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "14px" }}
        >
          Symptoms
        </h4>
        <div className="flex flex-col gap-2">
          {config.symptoms.length === 0 && (
            <p style={{ color: "rgba(250,250,250,0.3)", fontFamily: FONT, fontSize: "16px", fontStyle: "italic" }}>
              No symptoms added yet.
            </p>
          )}
          {config.symptoms.map((s) => (
            <SymptomRow key={s.id} symptom={s} onChange={updateSymptom} onRemove={() => removeSymptom(s.id)} />
          ))}
        </div>
        <AddSymptomRow onAdd={addSymptom} />
      </section>

      {/* Treatments */}
      {config.treatments && config.treatments.length > 0 && (
        <>
          <div className="h-px" style={{ background: "rgba(255,255,255,0.12)" }} />
          <section className="flex flex-col gap-3">
            <h4
              className="uppercase tracking-wider"
              style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "14px" }}
            >
              Treatments
            </h4>
            <ul className="flex flex-col gap-1">
              {config.treatments.map((t, i) => (
                <li key={i} className="flex gap-2" style={{ color: "rgba(250,250,250,0.6)", fontFamily: FONT, fontSize: "16px" }}>
                  <span style={{ color: "#00A6FF" }}>•</span>
                  {t}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
