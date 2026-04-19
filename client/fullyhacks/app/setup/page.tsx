"use client";

import { useState } from "react";
import DiseaseSelector from "@/components/DiseaseSelector";
import ScenarioEditor from "@/components/ScenarioEditor";
import { ScenarioConfig } from "@/types/scenario";

const BUBBLES: [number, number, number, number][] = [
  [14, 8, 0, 9],
  [22, 18, 2, 13],
  [10, 30, 5, 8],
  [18, 45, 1, 11],
  [26, 58, 3, 15],
  [12, 70, 6, 10],
  [20, 82, 0.5, 12],
  [8, 92, 4, 7],
];

export default function SetupPage() {
  const [selectedDisease, setSelectedDisease] = useState<string>("");
  const [editorConfig, setEditorConfig] = useState<ScenarioConfig | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const panelOpen = !!editorConfig && !!selectedDisease;

  function handleSelectDisease(name: string) {
    setSelectedDisease(name);
    setIsCustom(false);
  }

  function handleConfigChange(config: ScenarioConfig | null, custom = false) {
    setEditorConfig(config);
    setIsCustom(custom);
  }

  return (
    <main
      className="relative flex flex-col items-center justify-center min-h-screen px-4 py-16 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, #0d3b6e 0%, #0e2a4a 40%, #0a1628 100%)",
      }}
    >
      {BUBBLES.map(([size, left, delay, duration], i) => (
        <span
          key={i}
          className="bubble"
          style={{
            width: size,
            height: size,
            left: `${left}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${duration}s`,
          }}
        />
      ))}

      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 h-32 z-0"
        style={{
          background: "linear-gradient(to top, rgba(8,145,178,0.08), transparent)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center w-full max-w-5xl">
        <div className="mb-10 text-center">
          <div className="text-5xl mb-4 select-none">🐚</div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: "#22d3ee" }}>
            Teacher Portal
          </h1>
          <p className="text-base max-w-sm" style={{ color: "#7dd3e8" }}>
            Select a disease scenario to begin a patient interaction session.
          </p>
        </div>

        <div className="w-full flex items-start justify-center gap-5 transition-all duration-300">
          <div
            className="ocean-card rounded-2xl p-8 flex-shrink-0 transition-all duration-300"
            style={{ width: panelOpen ? "380px" : "448px" }}
          >
            <h2
              className="text-lg font-semibold mb-6"
              style={{ color: "#bae6fd" }}
            >
              Choose a scenario
            </h2>
            <DiseaseSelector
              selectedDisease={selectedDisease}
              editorConfig={editorConfig}
              onSelectDisease={handleSelectDisease}
              onConfigChange={handleConfigChange}
            />
          </div>

          <div
            className="ocean-card rounded-2xl overflow-hidden transition-all duration-300 flex-shrink-0"
            style={{
              width: panelOpen ? "420px" : "0px",
              opacity: panelOpen ? 1 : 0,
              padding: panelOpen ? "2rem" : "0",
              pointerEvents: panelOpen ? "auto" : "none",
            }}
          >
            {panelOpen && (
              <ScenarioEditor
                diseaseName={selectedDisease}
                config={editorConfig!}
                isCustom={isCustom}
                onChange={setEditorConfig}
                onRenameDisease={isCustom ? setSelectedDisease : undefined}
              />
            )}
          </div>
        </div>

        <p className="mt-8 text-xs" style={{ color: "#4a8fa8" }}>
          For educational use only. Not a diagnostic tool.
        </p>
      </div>
    </main>
  );
}
