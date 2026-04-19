"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fetchDiseaseList, fetchDiseaseConfig, createSession, uploadCurriculum } from "@/lib/api";
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

const FONT = "'Gochi Hand', cursive";

export default function DiseaseSelector({
  selectedDisease,
  editorConfig,
  onSelectDisease,
  onConfigChange,
}: Props) {
  const router = useRouter();
  const { data: session } = useSession();

  const [diseases, setDiseases] = useState<string[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [loadingConfig, setLoadingConfig] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCustom, setIsCustom] = useState(false);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("easy");

  // Curriculum upload state
  const [curriculumUploading, setCurriculumUploading] = useState(false);
  const [curriculumUploaded, setCurriculumUploaded] = useState(() => {
    try { return !!localStorage.getItem("curriculum_matches"); } catch { return false; }
  });
  const [curriculumError, setCurriculumError] = useState<string | null>(null);
  const [curriculumMatches, setCurriculumMatches] = useState<string[] | null>(() => {
    try {
      const saved = localStorage.getItem("curriculum_matches");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

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

  async function handleCurriculumUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const token = session?.backendToken;
    if (!token) { setCurriculumError("You must be logged in."); return; }
    setCurriculumUploading(true);
    setCurriculumError(null);
    setCurriculumMatches(null);
    try {
      const result = await uploadCurriculum(token, file);
      setCurriculumUploaded(true);
      setCurriculumMatches(result.diseases);
      try { localStorage.setItem("curriculum_matches", JSON.stringify(result.diseases)); } catch {}
    } catch (err) {
      setCurriculumError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCurriculumUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateDisease(selectedDisease);
    if (validationError) { setSubmitError(validationError); return; }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const backendToken = session?.backendToken;
      if (!backendToken) throw new Error("You must be logged in before starting a session.");
      try { sessionStorage.removeItem("chat_history"); } catch {}
      const createdSession = await createSession(editorConfig, selectedDisease, backendToken, difficulty);

      const v = (createdSession.vitals ?? {}) as Record<string, string | number>;
      const num = (val: string | number | undefined) =>
        val !== undefined ? parseFloat(String(val)) : undefined;
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
        session_id: createdSession.session_id,
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

      {/* Curriculum upload */}
      <div className="flex flex-col gap-2">
        <label style={{ color: "rgba(250,250,250,0.6)", fontSize: "20px", fontFamily: FONT }}>
          📄 Upload Curriculum PDF <span style={{ fontSize: "14px", color: "rgba(250,250,250,0.3)" }}>(optional)</span>
        </label>
        <label
          className="w-full py-2.5 rounded-lg border cursor-pointer flex items-center justify-center gap-2 transition-all"
          style={{
            background: curriculumUploaded ? "rgba(0,166,255,0.15)" : "rgba(250,250,250,0.06)",
            borderColor: curriculumUploaded ? "#00A6FF" : "rgba(255,255,255,0.25)",
            borderStyle: "dashed",
            color: curriculumUploaded ? "#00A6FF" : "rgba(250,250,250,0.5)",
            fontFamily: FONT,
            fontSize: "18px",
          }}
        >
          {curriculumUploading ? "Uploading…" : curriculumUploaded ? "✓ Curriculum uploaded" : "Choose PDF"}
          <input type="file" accept=".pdf" className="hidden" onChange={handleCurriculumUpload} disabled={curriculumUploading} />
        </label>

        {curriculumMatches !== null && (
          <p style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "15px" }}>
            {curriculumMatches.length > 0
              ? `${curriculumMatches.length} matching disease${curriculumMatches.length > 1 ? "s" : ""} highlighted below`
              : "No matching diseases found in your curriculum"}
          </p>
        )}

        {curriculumError && (
          <p style={{ color: "#f87171", fontFamily: FONT, fontSize: "16px" }}>⚠ {curriculumError}</p>
        )}
      </div>

      {/* Disease list */}
      <div className="flex flex-col gap-2">
        <label style={{ color: "rgba(250,250,250,0.6)", fontSize: "20px", fontFamily: FONT }}>
          Select a disease
        </label>

        {loadingList && (
          <p className="text-center animate-pulse py-4" style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "18px" }}>
            Loading diseases…
          </p>
        )}

        {listError && (
          <p style={{ color: "#f87171", fontFamily: FONT, fontSize: "18px" }}>⚠ {listError}</p>
        )}

        {!loadingList && !listError && (
          <div
            className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1"
            style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}
          >
            {(curriculumMatches !== null
              ? [...curriculumMatches, ...diseases.filter(d => !curriculumMatches.includes(d))]
              : diseases
            ).map((name) => {
              const isActive = selectedDisease === name && !isCustom;
              const isMatch = curriculumMatches !== null && curriculumMatches.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={loadingConfig}
                  onClick={() => handleSelectDisease(name)}
                  className="px-3 py-2 rounded-lg border transition-all duration-150 cursor-pointer text-left"
                  style={
                    isActive
                      ? { background: "#00A6FF", borderColor: "#FAFAFA", color: "#FAFAFA", fontFamily: FONT, fontSize: "18px" }
                      : isMatch
                      ? { background: "rgba(0,166,255,0.12)", borderColor: "#00A6FF", color: "#FAFAFA", fontFamily: FONT, fontSize: "18px", opacity: loadingConfig ? 0.5 : 1 }
                      : { background: "rgba(250,250,250,0.08)", borderColor: "rgba(255,255,255,0.2)", color: "rgba(250,250,250,0.7)", fontFamily: FONT, fontSize: "18px", opacity: loadingConfig ? 0.5 : 1 }
                  }
                >
                  {isMatch && !isActive && <span style={{ marginRight: 4 }}>★</span>}{name}
                </button>
              );
            })}
          </div>
        )}

        {loadingConfig && (
          <p className="text-center animate-pulse" style={{ color: "#00A6FF", fontFamily: FONT, fontSize: "18px" }}>
            Loading scenario data…
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3" style={{ color: "rgba(250,250,250,0.3)", fontFamily: FONT, fontSize: "18px" }}>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.15)" }} />
        or
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.15)" }} />
      </div>

      {/* Custom scenario */}
      <button
        type="button"
        onClick={handleCustomScenario}
        className="w-full py-2.5 rounded-lg border transition-all duration-150 cursor-pointer flex items-center justify-center gap-2"
        style={
          isCustom
            ? {
                background: "#00A6FF",
                borderColor: "#FAFAFA",
                color: "#FAFAFA",
                fontFamily: FONT,
                fontSize: "20px",
              }
            : {
                background: "rgba(250,250,250,0.06)",
                borderColor: "rgba(255,255,255,0.25)",
                borderStyle: "dashed",
                color: "rgba(250,250,250,0.5)",
                fontFamily: FONT,
                fontSize: "20px",
              }
        }
      >
        ＋ Create Custom Scenario
      </button>

      {/* Difficulty */}
      <div className="flex flex-col gap-2">
        <label style={{ color: "rgba(250,250,250,0.6)", fontSize: "20px", fontFamily: FONT }}>
          Patient difficulty
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(["easy", "medium", "hard"] as const).map((level) => {
            const isActive = difficulty === level;
            const activeColors = {
              easy:   { bg: "#00A6FF", border: "#FAFAFA", color: "#FAFAFA" },
              medium: { bg: "rgba(180,130,20,0.5)", border: "#fbbf24", color: "#fef3c7" },
              hard:   { bg: "rgba(180,30,30,0.5)",  border: "#f87171", color: "#fee2e2" },
            };
            const labels = { easy: "Easy", medium: "Medium", hard: "Hard" };
            return (
              <button
                key={level}
                type="button"
                onClick={() => setDifficulty(level)}
                className="py-2 rounded-lg border transition-all duration-150 cursor-pointer"
                style={
                  isActive
                    ? { ...activeColors[level], fontFamily: FONT, fontSize: "20px" }
                    : { background: "rgba(250,250,250,0.06)", borderColor: "rgba(255,255,255,0.2)", color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "20px" }
                }
              >
                {labels[level]}
              </button>
            );
          })}
        </div>
        <p style={{ color: "rgba(250,250,250,0.35)", fontFamily: FONT, fontSize: "16px" }}>
          {difficulty === "easy"   && "Cooperative patient — answers clearly and directly."}
          {difficulty === "medium" && "Anxious patient — vague on timing, needs follow-ups."}
          {difficulty === "hard"   && "Distressed patient — deflects, contradicts, minimises symptoms."}
        </p>
      </div>

      {/* Error */}
      {submitError && (
        <p role="alert" style={{ color: "#f87171", fontFamily: FONT, fontSize: "18px" }}>
          {submitError}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loadingConfig || submitting}
        className="w-full py-3 rounded-lg transition-all duration-150 flex items-center justify-between"
        style={{
          background: "#21B842",
          border: "2px solid #000300",
          borderRadius: "8px",
          padding: "12px 12px 12px 20px",
          opacity: loadingConfig || submitting ? 0.6 : 1,
          cursor: loadingConfig || submitting ? "not-allowed" : "pointer",
        }}
      >
        <span style={{ color: "#FFFFFF", fontSize: "24px", fontWeight: 700, fontFamily: "Inter, sans-serif" }}>
          {submitting ? "STARTING…" : "START SCENARIO"}
        </span>
        <span style={{ fontSize: "28px" }}>{submitting ? "…" : "➤"}</span>
      </button>
    </form>
  );
}
