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

// ─── Shared input style helpers ───────────────────────────────────────────────

const inputBase: React.CSSProperties = {
  background: "rgba(10,22,40,0.6)",
  border: "1px solid rgba(34,211,238,0.2)",
  color: "#e0f4f8",
};

function focusInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "#22d3ee";
  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(34,211,238,0.12)";
}
function blurInput(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = "rgba(34,211,238,0.2)";
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
  // Use range bounds as the hard limits if available
  const clampMin = range ? range.min : min;
  const clampMax = range ? range.max : max;

  function handleChange(raw: number) {
    if (isNaN(raw)) return;
    const clamped = Math.min(clampMax, Math.max(clampMin, raw));
    onChange(Math.round(clamped * 10) / 10);
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "#7dd3e8" }}>
        {label}
        <span className="ml-1 font-normal" style={{ color: "#4a8fa8" }}>({unit})</span>
      </label>
      <input
        type="number"
        value={value === 0 ? "" : value}
        min={clampMin}
        max={clampMax}
        step="0.1"
        placeholder="—"
        onChange={(e) => handleChange(Number(e.target.value))}
        className="w-full px-3 py-1.5 rounded-lg text-sm outline-none transition-all"
        style={inputBase}
        onFocus={focusInput}
        onBlur={blurInput}
      />
      {range && (
        <span className="text-xs" style={{ color: "#2a5f72" }}>
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
        background: symptom.present ? "rgba(8,145,178,0.12)" : "rgba(10,22,40,0.3)",
        border: "1px solid rgba(34,211,238,0.1)",
      }}
    >
      {/* Present toggle */}
      <button
        type="button"
        aria-label={symptom.present ? "Mark absent" : "Mark present"}
        onClick={() => onChange({ ...symptom, present: !symptom.present })}
        className="flex-shrink-0 w-5 h-5 rounded border transition-all"
        style={{
          background: symptom.present ? "#0891b2" : "transparent",
          borderColor: symptom.present ? "#22d3ee" : "rgba(34,211,238,0.3)",
          boxShadow: symptom.present ? "0 0 8px rgba(34,211,238,0.3)" : "none",
        }}
      >
        {symptom.present && (
          <span className="flex items-center justify-center text-white text-xs leading-none">✓</span>
        )}
      </button>

      {/* Label */}
      <span className="flex-1 text-sm" style={{ color: symptom.present ? "#e0f4f8" : "#4a8fa8" }}>
        {symptom.label}
      </span>

      {/* Remove */}
      <button
        type="button"
        aria-label="Remove symptom"
        onClick={onRemove}
        className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-all text-xs"
        style={{ color: "#4a8fa8" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "#f87171"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "#4a8fa8"; }}
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
        className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none transition-all"
        style={inputBase}
        onFocus={focusInput}
        onBlur={blurInput}
      />
      <button
        type="button"
        onClick={commit}
        className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
        style={{
          background: "rgba(8,145,178,0.3)",
          border: "1px solid rgba(34,211,238,0.3)",
          color: "#22d3ee",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(8,145,178,0.5)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(8,145,178,0.3)"; }}
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
    const newSymptom: Symptom = {
      id: `custom-${Date.now()}`,
      label,
      present: true,
      severity: "moderate",
    };
    onChange({ ...config, symptoms: [...config.symptoms, newSymptom] });
  }

  return (
    <div
      className="flex flex-col gap-5 overflow-y-auto"
      style={{
        maxHeight: "calc(100vh - 280px)",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(34,211,238,0.3) transparent",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-base">🩺</span>
        {isCustom && onRenameDisease ? (
          <input
            type="text"
            value={diseaseName}
            onChange={(e) => onRenameDisease(e.target.value)}
            placeholder="Scenario name…"
            className="flex-1 px-3 py-1 rounded-lg text-sm font-semibold outline-none transition-all"
            style={{ ...inputBase, color: "#22d3ee" }}
            onFocus={focusInput}
            onBlur={blurInput}
          />
        ) : (
          <h3 className="text-sm font-semibold" style={{ color: "#22d3ee" }}>
            {diseaseName} — Scenario Settings
          </h3>
        )}
      </div>

      {/* Vitals */}
      <section className="flex flex-col gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4a8fa8" }}>
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
            <VitalField label="Pain"       unit={config.vitalRanges.pain.unit}                   value={config.vitals.pain ?? 0}              min={0}   max={10}  range={config.vitalRanges.pain}                     onChange={(v) => updateVital("pain", v)} />
          )}
        </div>
      </section>

      {/* Divider */}
      <div className="h-px" style={{ background: "rgba(34,211,238,0.1)" }} />

      {/* Symptoms */}
      <section className="flex flex-col gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4a8fa8" }}>
          Symptoms
        </h4>

        <div className="flex flex-col gap-2">
          {config.symptoms.length === 0 && (
            <p className="text-xs italic" style={{ color: "#4a8fa8" }}>
              No symptoms added yet.
            </p>
          )}
          {config.symptoms.map((s) => (
            <SymptomRow
              key={s.id}
              symptom={s}
              onChange={updateSymptom}
              onRemove={() => removeSymptom(s.id)}
            />
          ))}
        </div>

        {/* Add symptom */}
        <AddSymptomRow onAdd={addSymptom} />
      </section>

      {/* Treatments — read-only, from backend */}
      {config.treatments && config.treatments.length > 0 && (
        <>
          <div className="h-px" style={{ background: "rgba(34,211,238,0.1)" }} />
          <section className="flex flex-col gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#4a8fa8" }}>
              Treatments
            </h4>
            <ul className="flex flex-col gap-1">
              {config.treatments.map((t, i) => (
                <li key={i} className="text-xs flex gap-2" style={{ color: "#7dd3e8" }}>
                  <span style={{ color: "#0891b2" }}>•</span>
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
