"use client";

import { useState } from "react";
import Link from "next/link";
import DiseaseSelector from "@/components/DiseaseSelector";
import ScenarioEditor from "@/components/ScenarioEditor";
import { ScenarioConfig } from "@/types/scenario";

const PANEL_BG = "linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url('/chat/Bikini bottom bamboo pattern.jpg')";

export default function SetupPage() {
  const [selectedDisease, setSelectedDisease] = useState<string>("");
  const [editorConfig, setEditorConfig] = useState<ScenarioConfig | null>(null);
  const [isCustom, setIsCustom] = useState(false);

  const panelOpen = !!editorConfig && !!selectedDisease;

  const [doctorJumping, setDoctorJumping] = useState(false);

  function triggerJump() {
    setDoctorJumping(false);
    // Force reflow so the animation restarts even on rapid clicks
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setDoctorJumping(true));
    });
  }

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
      className="relative w-full flex flex-col"
      style={{
        fontFamily: "'Gochi Hand', cursive",
        backgroundImage: "url('/chat/Single-Celled_Defense_196.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* ── Background overlay ── */}
      <div className="absolute inset-0 z-0" style={{ background: "rgba(0,0,0,0.75)" }} />

      {/* ── Nav bar — fixed height ── */}
      <nav
        className="relative z-50 flex-shrink-0 flex items-center justify-between px-6 py-3"
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
        <span className="text-sm" style={{ color: "rgba(250,250,250,0.5)", fontFamily: "'Gochi Hand', cursive" }}>
          Teacher Portal
        </span>
      </nav>

      {/* ── Content — fills remaining height exactly ── */}
      <div className="relative z-10 flex flex-col items-center flex-1 px-6 pt-6 pb-4 min-h-0" onClick={triggerJump}>

        {/* Header — fixed height, doesn't grow */}
        <div className="flex-shrink-0 mb-4 text-center">
          <h1
            className="text-4xl font-bold mb-2"
            style={{
              color: "#FAFAFA",
              fontFamily: "'Gochi Hand', cursive",
              textShadow: "0px 4px 20px rgba(0,60,117,0.6)",
            }}
          >
            Teacher Portal
          </h1>
          <p className="text-lg max-w-sm mx-auto" style={{ color: "rgba(250,250,250,0.6)", fontFamily: "'Gochi Hand', cursive" }}>
            Select a disease scenario to begin a patient interaction session.
          </p>
        </div>

        {/* Panels row — fills all remaining space, panels scroll inside */}
        <div className="relative w-full flex items-stretch justify-center gap-5 flex-1 min-h-0">

          {/* Disease selector panel */}
          <div
            className="flex-shrink-0 flex flex-col transition-all duration-300"
            style={{
              width: panelOpen ? "380px" : "448px",
              overflowY: "auto",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.2) transparent",
              borderRadius: "24px",
              padding: "28px 32px",
              border: "5px solid rgba(255,255,255,1)",
              boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
              backgroundImage: PANEL_BG,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <h2
              className="flex-shrink-0 text-2xl font-semibold mb-5"
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

          {/* Scenario editor panel — scrolls internally */}
          <div
            className="flex-shrink-0 transition-all duration-300"
            style={{
              width: panelOpen ? "420px" : "0px",
              overflowY: panelOpen ? "auto" : "hidden",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.2) transparent",
              opacity: panelOpen ? 1 : 0,
              padding: panelOpen ? "28px 32px" : "0",
              pointerEvents: panelOpen ? "auto" : "none",
              borderRadius: "24px",
              border: panelOpen ? "5px solid rgba(255,255,255,1)" : "none",
              boxShadow: panelOpen ? "0px 4px 10px 0px rgba(0,60,117,0.25)" : "none",
              backgroundImage: panelOpen ? PANEL_BG : "none",
              backgroundSize: "cover",
              backgroundPosition: "center",
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

          {/* Student doctor — absolutely positioned to the right of the centered panels */}
          <div className="absolute right-0 bottom-0 flex items-end pointer-events-none">
            <img
              src={doctorJumping ? "/chat/Gemini_Generated_Image_p2zugvp2zugvp2zu-removebg-preview.png" : "/chat/student-doctor.png"}
              alt="Student Doctor"
              className={doctorJumping ? "doctor-jump" : ""}
              onAnimationEnd={() => setDoctorJumping(false)}
              style={{ height: "480px", width: "auto", objectFit: "contain", filter: "drop-shadow(0px 4px 16px rgba(0,0,0,0.5))" }}
            />
          </div>

        </div>

        {/* Footer note */}
        <p
          className="flex-shrink-0 mt-3 text-sm"
          style={{ color: "rgba(250,250,250,0.3)", fontFamily: "'Gochi Hand', cursive" }}
        >
          For educational use only. Not a diagnostic tool.
        </p>
      </div>
    </main>
  );
}
