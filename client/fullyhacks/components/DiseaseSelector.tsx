"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDiseaseList, fetchDiseaseConfig } from "@/lib/api";
import { validateDisease } from "@/lib/validators";
import { ScenarioConfig } from "@/types/scenario";

interface Props {
  selectedDisease: string;
  editorConfig: ScenarioConfig | null;
  onSelectDisease: (name: string) => void;
  onConfigChange: (config: ScenarioConfig | null, isCustom?: boolean) => void;
}

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

  const [diseases, setDiseases] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  // Fetch disease list on mount
  useEffect(() => {
    fetchDiseaseList()
      .then(setDiseases)
      .catch((err) => setListError(err.message))
      .finally(() => setLoadingList(false));
  }, []);

  async function handleSelectDisease(name: string) {
    onSelectDisease(name);
    setIsCustom(false);
    setSubmitError(null);
    setLoadingConfig(true);
    try {
      const config = await fetchDiseaseConfig(name);
      onConfigChange(config, false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to load scenario");
      onConfigChange(null, false);
    } finally {
      setLoadingConfig(false);
    }
  }

  function handleCustomScenario() {
    setIsCustom(true);
    onSelectDisease("Custom Scenario");
    onConfigChange(blankConfig(), true);
    setSubmitError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateDisease(selectedDisease);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitError(null);
    router.push(`/conversation?disease=${encodeURIComponent(selectedDisease)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-5">
      {/* Disease list */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: "#7dd3e8" }}>
          Select a disease
        </label>

        {/* Loading state */}
        {loadingList && (
          <div className="flex items-center gap-2 py-4 justify-center">
            <span className="text-xs animate-pulse" style={{ color: "#4a8fa8" }}>
              Loading diseases…
            </span>
          </div>
        )}

        {/* List error */}
        {listError && (
          <p className="text-xs" style={{ color: "#f87171" }}>
            ⚠ Could not load diseases: {listError}
          </p>
        )}

        {/* Disease buttons */}
        {!loadingList && !listError && (
          <div
            className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(34,211,238,0.3) transparent" }}
          >
            {diseases.map((name) => {
              const isActive = selectedDisease === name && !isCustom;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={loadingConfig}
                  onClick={() => handleSelectDisease(name)}
                  className="px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 cursor-pointer text-left"
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
                          opacity: loadingConfig ? 0.5 : 1,
                        }
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading config indicator */}
        {loadingConfig && (
          <p className="text-xs text-center animate-pulse" style={{ color: "#22d3ee" }}>
            Loading scenario data…
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 text-sm" style={{ color: "#4a8fa8" }}>
        <div className="flex-1 h-px" style={{ background: "rgba(34,211,238,0.15)" }} />
        or
        <div className="flex-1 h-px" style={{ background: "rgba(34,211,238,0.15)" }} />
      </div>

      {/* Custom scenario */}
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
      {submitError && (
        <p role="alert" className="text-sm" style={{ color: "#f87171" }}>
          {submitError}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loadingConfig}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150"
        style={{
          background: "linear-gradient(135deg, #0891b2, #0e7490)",
          color: "#e0f4f8",
          boxShadow: "0 4px 20px rgba(8,145,178,0.35)",
          opacity: loadingConfig ? 0.6 : 1,
          cursor: loadingConfig ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => {
          if (!loadingConfig) {
            e.currentTarget.style.background = "linear-gradient(135deg, #22d3ee, #0891b2)";
            e.currentTarget.style.boxShadow = "0 4px 28px rgba(34,211,238,0.45)";
          }
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
