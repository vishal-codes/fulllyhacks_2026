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
  label, unit, value, min, max, onChange,
}: {
  label: string; unit: string; value: number;
  min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: "#7dd3e8" }}>
        {label}
        <span className="ml-1 font-normal" style={{ color: "#4a8fa8" }}>({unit})</span>
      </label>
      <input
        type="number"
        value={value === 0 ? "" : value}
        min={min}
        max={max}
        placeholder="—"
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-1.5 rounded-lg text-sm outline-none transition-all"
        style={inputBase}
        onFocus={focusInput}
        onBlur={blurInput}
      />
    </div>
  );
}

// ─── SymptomRow ───────────────────────────────────────────────────────────────

const SEVERITY_OPTIONS: Symptom["severity"][] = ["mild", "moderate", "severe"];
const SEVERITY_COLORS: Record<Symptom["severity"], string> = {
  mild: "#34d399", moderate: "#fbbf24", severe: "#f87171",
};

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

      {/* Severity */}
      <div className="flex gap-1">
        {SEVERITY_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={!symptom.present}
            onClick={() => onChange({ ...symptom, severity: s })}
            className="px-2 py-0.5 rounded text-xs font-medium transition-all capitalize"
            style={{
              background: symptom.severity === s && symptom.present ? `${SEVERITY_COLORS[s]}22` : "transparent",
              border: `1px solid ${symptom.severity === s && symptom.present ? SEVERITY_COLORS[s] : "rgba(34,211,238,0.1)"}`,
              color: symptom.severity === s && symptom.present ? SEVERITY_COLORS[s] : "#4a8fa8",
              opacity: symptom.present ? 1 : 0.4,
            }}
          >
            {s}
          </button>
        ))}
      </div>

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
          <VitalField label="Heart Rate"   unit="bpm"  value={config.vitals.heartRate}              min={30}  max={220} onChange={(v) => updateVital("heartRate", v)} />
          <VitalField label="BP Systolic"  unit="mmHg" value={config.vitals.bloodPressureSystolic}  min={60}  max={250} onChange={(v) => updateVital("bloodPressureSystolic", v)} />
          <VitalField label="BP Diastolic" unit="mmHg" value={config.vitals.bloodPressureDiastolic} min={40}  max={150} onChange={(v) => updateVital("bloodPressureDiastolic", v)} />
          <VitalField label="Resp. Rate"   unit="br/m" value={config.vitals.respiratoryRate}        min={8}   max={40}  onChange={(v) => updateVital("respiratoryRate", v)} />
          <VitalField label="Temperature"  unit="°F"   value={config.vitals.temperature}            min={95}  max={108} onChange={(v) => updateVital("temperature", v)} />
          <VitalField label="O₂ Sat"       unit="%"    value={config.vitals.oxygenSaturation}       min={70}  max={100} onChange={(v) => updateVital("oxygenSaturation", v)} />
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
    </div>
  );
}
