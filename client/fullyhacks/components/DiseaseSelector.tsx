"use client";

import { useRouter } from "next/navigation";
import { PREDEFINED_DISEASES } from "@/lib/scenarios";
import { validateDisease } from "@/lib/validators";
import { ScenarioConfig } from "@/types/scenario";
import { useState } from "react";

interface Props {
  selectedDisease: string;
  editorConfig: ScenarioConfig | null;
  onSelectDisease: (name: string) => void;
  onConfigChange: (config: ScenarioConfig | null, isCustom?: boolean) => void;
}

/** Blank config used when teacher creates a custom scenario */
function blankConfig(): ScenarioConfig {
  return {
    vitals: {
      heartRate: 0,
      bloodPressureSystolic: 0,
      bloodPressureDiastolic: 0,
      respiratoryRate: 0,
      temperature: 0,
      oxygenSaturation: 0,
    },
    symptoms: [],
  };
}

export default function DiseaseSelector({
  selectedDisease,
  onSelectDisease,
  onConfigChange,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  function handleSelectDisease(name: string) {
    const scenario = PREDEFINED_DISEASES.find((d) => d.name === name);
    onSelectDisease(name);
    setIsCustom(false);
    setError(null);
    // TODO: replace with API call when backend is ready
    // e.g. fetch(`/api/scenarios/${scenario.id}/defaults`).then(r => r.json()).then(onConfigChange)
    onConfigChange(
      scenario ? JSON.parse(JSON.stringify(scenario.defaultConfig)) : null,
      false
    );
  }

  function handleCustomScenario() {
    setIsCustom(true);
    onSelectDisease("Custom Scenario");
    onConfigChange(blankConfig(), true);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateDisease(selectedDisease);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    // TODO: pass editorConfig via context or route state when conversation page is ready
    router.push(`/conversation?disease=${encodeURIComponent(selectedDisease)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
      {/* Predefined disease buttons */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: "#7dd3e8" }}>
          Select a disease
        </label>
        <div
          className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1"
          style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(34,211,238,0.3) transparent" }}
        >
          {PREDEFINED_DISEASES.map((d) => {
            const isActive = selectedDisease === d.name && !isCustom;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => handleSelectDisease(d.name)}
                className="px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 cursor-pointer"
                style={
                  isActive
                    ? {
                        background: "rgba(8,145,178,0.5)",
                        borderColor: "#22d3ee",
                        color: "#e0f4f8",
                        boxShadow: "0 0 12px rgba(34,211,238,0.3)",
                      }
                    : {
                        background: "rgba(13,59,110,0.4)",
                        borderColor: "rgba(34,211,238,0.2)",
                        color: "#bae6fd",
                      }
                }
              >
                {d.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 text-sm" style={{ color: "#4a8fa8" }}>
        <div className="flex-1 h-px" style={{ background: "rgba(34,211,238,0.15)" }} />
        or
        <div className="flex-1 h-px" style={{ background: "rgba(34,211,238,0.15)" }} />
      </div>

      {/* Custom scenario button */}
      <button
        type="button"
        onClick={handleCustomScenario}
        className="w-full py-2.5 rounded-lg border text-sm font-medium transition-all duration-150 cursor-pointer flex items-center justify-center gap-2"
        style={
          isCustom
            ? {
                background: "rgba(8,145,178,0.2)",
                borderColor: "#22d3ee",
                color: "#e0f4f8",
                boxShadow: "0 0 12px rgba(34,211,238,0.2)",
              }
            : {
                background: "rgba(13,59,110,0.2)",
                borderColor: "rgba(34,211,238,0.25)",
                color: "#7dd3e8",
                borderStyle: "dashed",
              }
        }
      >
        <span>＋</span>
        Create Custom Scenario
      </button>

      {/* Error */}
      {error && (
        <p role="alert" className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150"
        style={{
          background: "linear-gradient(135deg, #0891b2, #0e7490)",
          color: "#e0f4f8",
          boxShadow: "0 4px 20px rgba(8,145,178,0.35)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #22d3ee, #0891b2)";
          e.currentTarget.style.boxShadow = "0 4px 28px rgba(34,211,238,0.45)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #0891b2, #0e7490)";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(8,145,178,0.35)";
        }}
      >
        🌊 Start Scenario
      </button>
    </form>
  );
}
