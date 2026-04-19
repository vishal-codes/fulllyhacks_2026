"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import DiseaseSelector from "@/components/DiseaseSelector";
import ScenarioEditor from "@/components/ScenarioEditor";
import { ScenarioConfig } from "@/types/scenario";

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
      className="relative w-full min-h-screen overflow-hidden flex flex-col"
      style={{ background: "#09090B", fontFamily: "'Gochi Hand', cursive" }}
    >
      {/* ── Background image ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/chat/chat-bg.png"
          alt=""
          fill
          className="object-cover"
          priority
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(9,9,11,0.55) 0%, rgba(9,9,11,0.35) 60%, rgba(250,250,250,0.15) 100%)",
          }}
        />
      </div>

      {/* ── Nav bar ── */}
      <nav
        className="relative z-50 flex items-center justify-between px-6 py-3"
        style={{
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          background: "rgba(250,250,250,0.05)",
          borderBottom: "1px solid rgba(250,250,250,0.1)",
        }}
      >
        <Link
          href="/"
          className="text-sm font-medium transition-opacity hover:opacity-70"
          style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}
        >
          ← Home
        </Link>
        <span
          className="text-sm"
          style={{ color: "rgba(250,250,250,0.5)", fontFamily: "'Gochi Hand', cursive" }}
        >
          Teacher Portal
        </span>
      </nav>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 py-12">

        {/* Header */}
        <div className="mb-10 text-center">
          <h1
            className="text-5xl font-bold mb-3"
            style={{
              color: "#FAFAFA",
              fontFamily: "'Gochi Hand', cursive",
              textShadow: "0px 4px 20px rgba(0,60,117,0.6)",
            }}
          >
            Teacher Portal
          </h1>
          <p
            className="text-xl max-w-sm mx-auto"
            style={{ color: "rgba(250,250,250,0.6)", fontFamily: "'Gochi Hand', cursive" }}
          >
            Select a disease scenario to begin a patient interaction session.
          </p>
        </div>

        {/* Panels row */}
        <div className="w-full flex items-start justify-center gap-5 transition-all duration-300">

          {/* Disease selector panel */}
          <div
            className="flex-shrink-0 flex flex-col transition-all duration-300"
            style={{
              width: panelOpen ? "380px" : "448px",
              borderRadius: "24px",
              padding: "32px",
              border: "5px solid rgba(255,255,255,1)",
              boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
              background: "rgba(9,9,11,0.55)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
            }}
          >
            <h2
              className="text-2xl font-semibold mb-6"
              style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}
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

          {/* Scenario editor panel */}
          <div
            className="flex-shrink-0 overflow-hidden transition-all duration-300"
            style={{
              width: panelOpen ? "420px" : "0px",
              opacity: panelOpen ? 1 : 0,
              padding: panelOpen ? "32px" : "0",
              pointerEvents: panelOpen ? "auto" : "none",
              borderRadius: "24px",
              border: panelOpen ? "5px solid rgba(255,255,255,1)" : "none",
              boxShadow: panelOpen ? "0px 4px 10px 0px rgba(0,60,117,0.25)" : "none",
              background: "rgba(9,9,11,0.55)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
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

        <p
          className="mt-8 text-sm"
          style={{ color: "rgba(250,250,250,0.3)", fontFamily: "'Gochi Hand', cursive" }}
        >
          For educational use only. Not a diagnostic tool.
        </p>
      </div>
    </main>
  );
}
