"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchDiseaseList, fetchDiseaseConfig, createSession } from "@/lib/api";
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
  editorConfig,
  onSelectDisease,
  onConfigChange,
}: Props) {
  const router = useRouter();

  const [diseases, setDiseases] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateDisease(selectedDisease);
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      // Clear previous conversation history before starting a new session
      try { sessionStorage.removeItem("chat_history"); } catch {}
      const session = await createSession(editorConfig, selectedDisease, difficulty);

      // Build URL with vitals from the session response so the conversation
      // page can display them in the Diagnostics Tools panel.
      // Backend returns formatted strings: { BP: "120/80 mmHg", HR: "88 bpm", Temp: "37.2C", SpO2: "97%", RR: "16 breaths/min", Pain: "3/10" }
      const v = (session.vitals ?? {}) as Record<string, string | number>;

      // Parse helpers
      const num = (val: string | number | undefined) =>
        val !== undefined ? parseFloat(String(val)) : undefined;

      // BP comes as "120/80 mmHg" — split on "/"
      const bpRaw = v["BP"] ? String(v["BP"]).split("/") : [];
      const bpSys = bpRaw[0] ? parseFloat(bpRaw[0]) : undefined;
      const bpDia = bpRaw[1] ? parseFloat(bpRaw[1]) : undefined;

      const vitalsParams: Record<string, string> = {};
      if (bpSys !== undefined && !isNaN(bpSys)) vitalsParams.bp_sys = String(bpSys);
      if (bpDia !== undefined && !isNaN(bpDia)) vitalsParams.bp_dia = String(bpDia);
      const hr   = num(v["HR"]);   if (hr   !== undefined && !isNaN(hr))   vitalsParams.hr   = String(hr);
      const temp = num(v["Temp"]); if (temp !== undefined && !isNaN(temp)) vitalsParams.temp = String(temp);
      const spo2 = num(v["SpO2"]); if (spo2 !== undefined && !isNaN(spo2)) vitalsParams.spo2 = String(spo2);
      const rr   = num(v["RR"]);   if (rr   !== undefined && !isNaN(rr))   vitalsParams.rr   = String(rr);
      const pain = num(v["Pain"]); if (pain !== undefined && !isNaN(pain)) vitalsParams.pain = String(pain);

      const params = new URLSearchParams({
        disease: selectedDisease,
        ...(session.session_id ? { session_id: session.session_id } : {}),
        ...vitalsParams,
      });
      router.push(`/conversation?${params.toString()}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to start session");
      setSubmitting(false);
    }
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

      {/* Difficulty */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" style={{ color: "#7dd3e8" }}>
          Patient difficulty
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as const).map((level) => {
            const isActive = difficulty === level;
            const activeStyles: Record<typeof level, React.CSSProperties> = {
              easy: {
                background: "rgba(8,145,178,0.5)",
                borderColor: "#22d3ee",
                color: "#e0f4f8",
                boxShadow: "0 0 10px rgba(34,211,238,0.3)",
              },
              medium: {
                background: "rgba(180,130,20,0.35)",
                borderColor: "#fbbf24",
                color: "#fef3c7",
                boxShadow: "0 0 10px rgba(251,191,36,0.25)",
              },
              hard: {
                background: "rgba(180,30,30,0.35)",
                borderColor: "#f87171",
                color: "#fee2e2",
                boxShadow: "0 0 10px rgba(248,113,113,0.25)",
              },
            };
            const labels: Record<typeof level, string> = {
              easy: "Easy",
              medium: "Medium",
              hard: "Hard",
            };
            return (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className="py-2 rounded-lg border text-sm font-medium transition-all duration-150 cursor-pointer"
                style={
                  isActive
                    ? activeStyles[level]
                    : {
                        background: "rgba(13,59,110,0.3)",
                        borderColor: "rgba(34,211,238,0.15)",
                        color: "#4a8fa8",
                      }
                }
              >
                {labels[level]}
              </button>
            );
          })}
        </div>
        <p className="text-xs" style={{ color: "#2a5f72" }}>
          {difficulty === "easy" && "Cooperative patient — answers clearly and directly."}
          {difficulty === "medium" && "Anxious patient — vague on timing, needs follow-ups."}
          {difficulty === "hard" && "Distressed patient — deflects, contradicts, minimises symptoms."}
        </p>
      </div>

      {/* Error */}
      {submitError && (
        <p role="alert" className="text-sm" style={{ color: "#f87171" }}>
          {submitError}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loadingConfig || submitting}
        className="w-full py-3 rounded-lg font-semibold text-sm transition-all duration-150"
        style={{
          background: "linear-gradient(135deg, #0891b2, #0e7490)",
          color: "#e0f4f8",
          boxShadow: "0 4px 20px rgba(8,145,178,0.35)",
          opacity: loadingConfig || submitting ? 0.6 : 1,
          cursor: loadingConfig || submitting ? "not-allowed" : "pointer",
        }}
        onMouseEnter={(e) => {
          if (!loadingConfig && !submitting) {
            e.currentTarget.style.background = "linear-gradient(135deg, #22d3ee, #0891b2)";
            e.currentTarget.style.boxShadow = "0 4px 28px rgba(34,211,238,0.45)";
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, #0891b2, #0e7490)";
          e.currentTarget.style.boxShadow = "0 4px 20px rgba(8,145,178,0.35)";
        }}
      >
        {submitting ? "Starting…" : "🌊 Start Scenario"}
      </button>
    </form>
  );
}
