"use client";

import { useState, useRef, Suspense, useEffect } from "react";
import { useScribe } from "@elevenlabs/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { endSession, sendChatMessage, speakText } from "@/lib/api";

async function fetchScribeToken(): Promise<string> {
  const res = await fetch("/api/scribe-token");
  if (!res.ok) throw new Error("Failed to fetch scribe token");
  const data = await res.json();
  return data.token as string;
}

interface ChatMessage {
  role: "student" | "patient";
  text: string;
}

// Vitals passed via URL search params (set during session creation)
interface VitalsDisplay {
  temperature?: number;
  heartRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  pain?: number;
}

const DIAGNOSTIC_TOOLS = [
  {
    key: "temperature" as keyof VitalsDisplay,
    label: "Temperature:",
    image: "/chat/tool-temperature.png",
    format: (v: number) => `${v} °F`,
  },
  {
    key: "heartRate" as keyof VitalsDisplay,
    label: "Heart Rate:",
    image: "/chat/tool-heartrate.png",
    format: (v: number) => `${v} BPM`,
  },
  {
    key: "bloodPressureSystolic" as keyof VitalsDisplay,
    label: "Blood Pressure:",
    image: "/chat/tool-bloodpressure.png",
    format: (_v: number, vitals?: VitalsDisplay) =>
      `${vitals?.bloodPressureSystolic ?? "—"}/${vitals?.bloodPressureDiastolic ?? "—"} mmHg`,
  },
  {
    key: "oxygenSaturation" as keyof VitalsDisplay,
    label: "Blood Oxygen:",
    image: "/chat/tool-oxygen.png",
    format: (v: number) => `${v}%`,
  },
  {
    key: "respiratoryRate" as keyof VitalsDisplay,
    label: "Respiration Rate:",
    image: "/chat/tool-respiration.png",
    format: (v: number) => `${v} /min`,
  },
  {
    key: "pain" as keyof VitalsDisplay,
    label: "Pain:",
    image: "/chat/tool-pain.png",
    format: (v: number) => `${v}/10`,
  },
];

// Patient speech bubble — the ai-patient-top.png sprite, animated in/out
function PatientBubble({ visible }: { visible: boolean }) {
  const [rendered, setRendered] = useState(visible);
  const [animClass, setAnimClass] = useState(visible ? "bubble-in" : "");

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setAnimClass("bubble-in");
    } else if (rendered) {
      setAnimClass("bubble-out");
      const t = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return (
    <div className={animClass} style={{ height: "127px", position: "relative", visibility: rendered ? "visible" : "hidden" }}>
      <Image src="/chat/ai-patient-top.png" alt="AI Patient speaking" fill className="object-cover" />
    </div>
  );
}

// Speech bubble with slide-up/fade-in on mount and pop on unmount
function SpeechBubble({ src, alt, visible }: { src: string; alt: string; visible: boolean }) {
  const [rendered, setRendered] = useState(visible);
  const [animClass, setAnimClass] = useState(visible ? "bubble-in" : "");

  useEffect(() => {
    if (visible) {
      setRendered(true);
      setAnimClass("bubble-in");
    } else if (rendered) {
      setAnimClass("bubble-out");
      const t = setTimeout(() => setRendered(false), 200);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!rendered) return null;
  return (
    <div className={animClass} style={{ position: "absolute", top: "-127px", left: "0", right: "0", margin: "0 auto", zIndex: 20, width: "154px", height: "127px" }}>
      <Image src={src} alt={alt} width={154} height={127} style={{ objectFit: "contain", width: "100%", height: "100%" }} />
    </div>
  );
}

// Staggered "..." loading indicator — each dot fades in/out with an offset
function StaggeredDots() {
  return (
    <span style={{ display: "inline-flex", gap: "3px", alignItems: "baseline" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            animation: `vital-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
            fontSize: "inherit",
            lineHeight: "inherit",
          }}
        >
          .
        </span>
      ))}
    </span>
  );
}

function ConversationContent() {
  const router = useRouter();
  const { data: session } = useSession();
  const params = useSearchParams();
  const sessionId = params.get("session_id") ?? "";

  // Parse vitals from URL params — set by DiseaseSelector after POST /session/new
  const vitals: VitalsDisplay = {
    temperature:           params.get("temp")   ? Number(params.get("temp"))   : undefined,
    heartRate:             params.get("hr")     ? Number(params.get("hr"))     : undefined,
    bloodPressureSystolic: params.get("bp_sys") ? Number(params.get("bp_sys")) : undefined,
    bloodPressureDiastolic:params.get("bp_dia") ? Number(params.get("bp_dia")) : undefined,
    oxygenSaturation:      params.get("spo2")   ? Number(params.get("spo2"))   : undefined,
    respiratoryRate:       params.get("rr")     ? Number(params.get("rr"))     : undefined,
    pain:                  params.get("pain")   ? Number(params.get("pain"))   : undefined,
  };

  // ── Chat history ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  // ── TTS ───────────────────────────────────────────────────────────────────
  const [ttsLoading, setTtsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  async function playPatientResponse(text: string) {
    stopSpeaking();
    setTtsLoading(true);
    const audioUrl = await speakText(text);
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setTtsLoading(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        setTtsLoading(false);
      };
      try {
        await audio.play();
        return;
      } catch {
        URL.revokeObjectURL(audioUrl);
      }
    }

    if (typeof window === "undefined" || !window.speechSynthesis) {
      setTtsLoading(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.92;
    utterance.pitch = 0.95;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && /natural|enhanced|premium/i.test(v.name)
    ) ?? voices.find((v) => v.lang.startsWith("en")) ?? null;
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => setTtsLoading(false);
    utterance.onerror = () => setTtsLoading(false);
    window.speechSynthesis.speak(utterance);
  }

  function appendMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  async function submitToChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed || chatLoading) return;
    appendMessage({ role: "student", text: trimmed });
    setChatLoading(true);
    setChatError(null);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
    try {
      const backendToken = session?.backendToken;
      if (!sessionId) {
        throw new Error("Missing session id. Start a new session from setup.");
      }
      if (!backendToken) {
        throw new Error("You are not authenticated with the backend.");
      }
      const res = await sendChatMessage(sessionId, backendToken, trimmed);
      appendMessage({ role: "patient", text: res.response });
      // Auto-play the patient's response via ElevenLabs TTS
      playPatientResponse(res.response);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setChatLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  // ── Text input ───────────────────────────────────────────────────────────
  const [textInput, setTextInput] = useState("");

  function handleTextSend() {
    if (!textInput.trim() || chatLoading) return;
    if (!session?.backendToken) {
      setChatError("Not authenticated. Please log in to use the competition.");
      return;
    }
    showDoctorBubble();
    submitToChat(textInput);
    setTextInput("");
  }

  function handleTextKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTextSend();
    }
  }

  // ── ElevenLabs Scribe ────────────────────────────────────────────────────
  const [scribeError, setScribeError] = useState<string | null>(null);
  const [displayTranscript, setDisplayTranscript] = useState<string>("");
  const accumulatedTextRef = useRef<string>("");
  const partialTextRef = useRef<string>("");

  const { status, connect, disconnect, clearTranscripts, error: scribeHookError } = useScribe({
    modelId: "scribe_v2_realtime",
    microphone: {},
    onPartialTranscript: (data) => {
      partialTextRef.current = data.text;
      setDisplayTranscript((accumulatedTextRef.current + " " + data.text).trim());
    },
    onCommittedTranscript: (data) => {
      accumulatedTextRef.current = (accumulatedTextRef.current + " " + data.text).trim();
      partialTextRef.current = "";
      setDisplayTranscript(accumulatedTextRef.current);
    },
    onError: (err) => {
      setScribeError(err instanceof Error ? err.message : "Mic error");
    },
  });

  const isListening = status === "connected" || status === "transcribing";
  const isConnecting = status === "connecting";

  function resetScribe() {
    accumulatedTextRef.current = "";
    partialTextRef.current = "";
    setDisplayTranscript("");
    setScribeError(null);
  }

  async function handleMicToggle() {
    setScribeError(null);
    if (isListening) {
      const text = (accumulatedTextRef.current || partialTextRef.current).trim();
      resetScribe();
      disconnect();
      clearTranscripts();
      if (text) {
        // Check auth before attempting to send
        if (!session?.backendToken) {
          setChatError("Not authenticated. Please log in to use the competition.");
          return;
        }
        showDoctorBubble();
        await submitToChat(text);
      }
    } else {
      resetScribe();
      try {
        const token = await fetchScribeToken();
        await connect({ token });
      } catch (err) {
        setScribeError(err instanceof Error ? err.message : "Failed to connect mic");
      }
    }
  }

  // Send mic transcript as text input
  function handleMicSendAsText() {
    const text = displayTranscript.trim();
    if (!text) return;
    setTextInput(text);
    resetScribe();
    disconnect();
    clearTranscripts();
  }

  // ── Vital sign reveal mechanic ───────────────────────────────────────────
  // Keys start hidden; clicking a tool card triggers a 3s "measuring" animation
  // then reveals the value with a fade-in.
  const [revealedVitals, setRevealedVitals] = useState<Set<string>>(new Set());
  const [measuringVitals, setMeasuringVitals] = useState<Set<string>>(new Set());

  function handleMeasureVital(key: string) {
    if (revealedVitals.has(key) || measuringVitals.has(key)) return;
    setMeasuringVitals((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setMeasuringVitals((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setRevealedVitals((prev) => new Set(prev).add(key));
    }, 3000);
  }

  const errorMsg = scribeError ?? scribeHookError;
  const [endingSession, setEndingSession] = useState(false);

  // ── Speech bubble visibility ──────────────────────────────────────────────
  // Patient bubble: shown while TTS is playing (ttsLoading)
  // Doctor bubble: shown while mic is active OR for 3s after sending a message
  const [doctorSpeaking, setDoctorSpeaking] = useState(false);
  const doctorSpeakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showDoctorBubble() {
    if (doctorSpeakingTimerRef.current) clearTimeout(doctorSpeakingTimerRef.current);
    setDoctorSpeaking(true);
    doctorSpeakingTimerRef.current = setTimeout(() => setDoctorSpeaking(false), 3000);
  }

  async function handleEndSession() {
    if (endingSession) return;
    setEndingSession(true);
    setChatError(null);
    try {
      const backendToken = session?.backendToken;
      if (!sessionId) {
        throw new Error("Missing session id. Start a new session from setup.");
      }
      if (!backendToken) {
        throw new Error("You are not authenticated with the backend.");
      }
      const report = await endSession(sessionId, backendToken);
      sessionStorage.setItem("last_osce_report", JSON.stringify(report));
      router.push("/report");
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to end session");
      setEndingSession(false);
    }
  }

  return (
    <main
      className="relative w-full min-h-screen overflow-hidden"
      style={{ background: "#09090B", fontFamily: "'Gochi Hand', cursive" }}
    >
      {/* ── Full-page background image ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/chat/chat-bg.png"
          alt=""
          fill
          className="object-cover"
          priority
        />
        {/* Right-side fade overlay matching Figma gradient */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(9,9,11,0) 69%, rgba(250,250,250,0.5) 100%)",
          }}
        />
      </div>

      {/* ── Nav Bar (absolute, top) ── */}
      <nav
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 py-3"
        style={{
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          background: "rgba(250,250,250,0.05)",
          borderBottom: "1px solid rgba(250,250,250,0.1)",
        }}
      >
        <div className="flex items-center gap-6">
          <Link
            href="/setup"
            className="text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}
          >
            ← Back
          </Link>
         
        </div>
        <span
          className="text-sm"
          style={{ color: "rgba(250,250,250,0.5)", fontFamily: "'Gochi Hand', cursive" }}
        >
          Patient Consultation
        </span>
      </nav>

      {/* ── Main content row ── */}
      <div
        className="relative z-10 flex items-stretch justify-between pt-16"
        style={{ minHeight: "100vh" }}
      >
        {/* ── Left: AI Patient character ── */}
        <div
          className="flex flex-col justify-end items-center flex-shrink-0"
          style={{ width: "250px", padding: "59px 48px" }}
        >
          <div className="flex flex-col items-stretch" style={{ width: "154px", gap: "30px", position: "relative" }}>
            {/* ai-patient-top.png is the speech variant — animated in/out with TTS */}
            <PatientBubble visible={ttsLoading} />
            <div style={{ height: "345px", position: "relative" }}>
              <Image src="/chat/ai-patient-body.png" alt="AI Patient Body" fill className="object-cover" />
            </div>
          </div>
        </div>

        {/* ── Center: Chat Window ── */}
        <div
          className="flex flex-col justify-center items-stretch flex-shrink-0"
          style={{
            width: "698px",
            padding: "266px 51px 94px 44px",
            backgroundImage: "url('/chat/chat-window-bg-76c432.png')",
            backgroundSize: "100% 100%",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Panel */}
          <div
            className="flex flex-col justify-end items-stretch flex-1"
            style={{
              borderRadius: "24px",
              padding: "18px",
              gap: "10px",
              background: "transparent",
            }}
          >
            {/* Texts Stream */}
            <div
              className="flex flex-col overflow-y-auto"
              style={{
                borderRadius: "9px",
                gap: "24px",
                padding: "12px",
                flex: 1,
                maxHeight: "420px",
                scrollbarWidth: "thin",
                scrollbarColor: "rgba(250,250,250,0.2) transparent",
              }}
            >
              {messages.length === 0 && (
                <p
                  className="text-center italic mt-8"
                  style={{ color: "rgba(250,250,250,0.35)", fontSize: "20px" }}
                >
                  Speak or type to begin the consultation.
                </p>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className="flex flex-col"
                  style={{
                    alignItems: m.role === "student" ? "flex-end" : "flex-start",
                    gap: "10px",
                  }}
                >
                  {m.role === "student" ? (
                    /* Student bubble — right-aligned, blue */
                    <div
                      style={{
                        background: "#00A6FF",
                        borderRadius: "20px 20px 0px 20px",
                        padding: "12px 12px 12px 16px",
                        maxWidth: "80%",
                        color: "#FAFAFA",
                        fontSize: "24px",
                        lineHeight: "1.18em",
                        fontFamily: "'Gochi Hand', cursive",
                      }}
                    >
                      {m.text}
                    </div>
                  ) : (
                    /* Patient bubble — left-aligned, grey with border + replay */
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div
                        style={{
                          background: "rgba(102,99,93,0.6)",
                          border: "2px solid #74777A",
                          borderRadius: "20px 20px 20px 0px",
                          padding: "12px 12px 12px 16px",
                          width: "359px",
                          color: "#FAFAFA",
                          fontSize: "24px",
                          lineHeight: "1.18em",
                          fontFamily: "'Gochi Hand', cursive",
                        }}
                      >
                        {m.text}
                      </div>
                      {/* Replay row */}
                      <div className="flex items-center" style={{ gap: "10px" }}>
                        <button
                          onClick={() => playPatientResponse(m.text)}
                          disabled={ttsLoading}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: ttsLoading ? "wait" : "pointer",
                            color: "#FAFAFA",
                            fontSize: "20px",
                            fontFamily: "'Gochi Hand', cursive",
                            opacity: ttsLoading ? 0.5 : 1,
                            padding: 0,
                          }}
                        >
                          {ttsLoading ? "⏳ Playing…" : "🔊 Replay"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading bubble */}
              {chatLoading && (
                <div className="flex flex-col" style={{ alignItems: "flex-start", gap: "10px" }}>
                  <div
                    className="animate-pulse"
                    style={{
                      background: "rgba(102,99,93,0.6)",
                      border: "2px solid #74777A",
                      borderRadius: "20px 20px 20px 0px",
                      padding: "12px 16px",
                      color: "#FAFAFA",
                      fontSize: "24px",
                      fontFamily: "'Gochi Hand', cursive",
                    }}
                  >
                    …
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Chatbox input row */}
            <div
              className="flex items-center justify-between"
              style={{
                background: "#FAFAFA",
                border: "5px solid #FAFAFA",
                borderRadius: "9px",
                padding: "12px 12px 12px 16px",
              }}
            >
              {/* Live transcript preview or text input */}
              {isListening || isConnecting ? (
                <div className="flex-1 flex items-center" style={{ gap: "8px" }}>
                  <span
                    style={{
                      color: isListening ? "#ef4444" : "#717171",
                      fontSize: "24px",
                      fontFamily: "'Gochi Hand', cursive",
                      flex: 1,
                    }}
                  >
                    {displayTranscript || (isConnecting ? "Connecting…" : "Listening…")}
                  </span>
                  {displayTranscript && (
                    <button
                      onClick={handleMicSendAsText}
                      style={{
                        background: "#00A6FF",
                        border: "none",
                        borderRadius: "4px",
                        padding: "4px 10px",
                        color: "#FAFAFA",
                        fontSize: "18px",
                        fontFamily: "'Gochi Hand', cursive",
                        cursor: "pointer",
                      }}
                    >
                      Use
                    </button>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleTextKeyDown}
                  placeholder="Respond to patient here..."
                  disabled={chatLoading}
                  className="flex-1 outline-none bg-transparent"
                  style={{
                    color: textInput ? "#09090B" : "#717171",
                    fontSize: "24px",
                    fontFamily: "'Gochi Hand', cursive",
                    lineHeight: "1.18em",
                  }}
                />
              )}

              {/* Mic / Send button */}
              <button
                onClick={isListening ? handleMicToggle : textInput.trim() ? handleTextSend : handleMicToggle}
                disabled={isConnecting || chatLoading}
                className="flex items-center gap-2 transition-opacity"
                style={{
                  background: isListening ? "rgba(239,68,68,0.15)" : "#00A6FF",
                  border: isListening ? "2px solid #ef4444" : "none",
                  borderRadius: "4px",
                  padding: "6px 12px 6px 6px",
                  cursor: isConnecting || chatLoading ? "not-allowed" : "pointer",
                  opacity: isConnecting || chatLoading ? 0.6 : 1,
                  flexShrink: 0,
                }}
                aria-label={isListening ? "Stop recording" : textInput.trim() ? "Send message" : "Start recording"}
              >
                <span style={{ fontSize: "20px" }}>
                  {isConnecting ? "⏳" : chatLoading ? "📡" : isListening ? "⏹" : textInput.trim() ? "➤" : "🎙️"}
                </span>
                <span
                  style={{
                    color: "#FAFAFA",
                    fontSize: "24px",
                    fontFamily: "'Gochi Hand', cursive",
                    lineHeight: "1.18em",
                  }}
                >
                  {isConnecting ? "Connecting" : chatLoading ? "Sending" : isListening ? "Stop" : textInput.trim() ? "Send" : "Record"}
                </span>
              </button>
            </div>

            {/* Error display */}
            {(errorMsg || chatError) && (
              <p
                className="text-center"
                style={{ color: "#f87171", fontSize: "18px", fontFamily: "'Gochi Hand', cursive" }}
              >
                ⚠ {errorMsg ?? chatError}
              </p>
            )}
          </div>
        </div>

        {/* ── Right side: Student Doctor + Tools + Submit ── */}
        <div className="flex flex-1 items-stretch" style={{ minWidth: 0 }}>
          {/* Student Doctor character */}
          <div
            className="flex flex-col justify-end items-center flex-shrink-0"
            style={{ width: "250px", padding: "59px 48px" }}
          >
            <div style={{ width: "154px", height: "345px", position: "relative" }}>
              {/* Doctor speech bubble — visible while mic is active or just after sending */}
              <SpeechBubble
                src="/chat/Speech Doctor.png"
                alt="Doctor speaking"
                visible={isListening || isConnecting || doctorSpeaking}
              />
              <Image
                src="/chat/student-doctor.png"
                alt="Student Doctor"
                fill
                className="object-cover"
              />
            </div>
          </div>

          {/* Tools and Submit panels */}
          <div
            className="flex flex-col justify-center flex-1"
            style={{ gap: "20px", padding: "20px" }}
          >
            {/* Diagnostics Tools Panel */}
            <div
              className="flex flex-col"
              style={{
                borderRadius: "24px",
                padding: "24px",
                gap: "12px",
                backgroundImage: "url('/chat/tools-panel-bg-a366ba.png')",
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                border: "5px solid rgba(255,255,255,1)",
                boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
              }}
            >
              <h2
                className="text-center"
                style={{
                  color: "#FFFFFF",
                  fontSize: "36px",
                  fontFamily: "'Gochi Hand', cursive",
                  lineHeight: "1.18em",
                  textShadow: "0px 4px 10px rgba(0,60,117,0.5)",
                }}
              >
                Diagnostics Tools
              </h2>

              {/* Row 1: Temperature, Heart Rate, Blood Pressure */}
              <div className="flex justify-between" style={{ gap: "8px" }}>
                {DIAGNOSTIC_TOOLS.slice(0, 3).map((tool) => {
                  const val = vitals[tool.key];
                  const displayVal =
                    tool.key === "bloodPressureSystolic"
                      ? `${vitals.bloodPressureSystolic ?? "—"}/${vitals.bloodPressureDiastolic ?? "—"} mmHg`
                      : val !== undefined
                      ? tool.format(val, vitals)
                      : "—";
                  const revealed  = revealedVitals.has(tool.key);
                  const measuring = measuringVitals.has(tool.key);
                  return (
                    <button
                      key={tool.key}
                      onClick={() => handleMeasureVital(tool.key)}
                      disabled={revealed || measuring}
                      className="flex flex-col items-stretch text-left"
                      style={{
                        width: "138px", gap: "6px",
                        background: "none", border: "none", padding: 0,
                        cursor: revealed || measuring ? "default" : "pointer",
                      }}
                      title={revealed ? undefined : "Click to measure"}
                    >
                      <div className={measuring ? "vital-measuring" : ""} style={{ height: "138px", position: "relative", filter: "drop-shadow(0px 4px 10px rgba(0,60,117,0.7))" }}>
                        <Image src={tool.image} alt={tool.label} fill className="object-cover" />
                      </div>
                      <span className="text-center" style={{ color: "#FFFFFF", fontSize: "20px", fontFamily: "'Gochi Hand', cursive", textShadow: "0px 4px 10px rgba(0,60,117,1)" }}>
                        {tool.label}
                      </span>
                      <span className={`text-center${revealed ? " vital-reveal" : ""}`} style={{ color: "#FFFFFF", fontSize: "36px", fontFamily: "'Gochi Hand', cursive", lineHeight: "1.18em", textShadow: "0px 4px 10px rgba(0,60,117,1)", minHeight: "42px" }}>
                        {measuring ? <StaggeredDots /> : revealed ? displayVal : "?"}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Row 2: Blood Oxygen, Respiration Rate, Pain */}
              <div className="flex justify-between" style={{ gap: "8px" }}>
                {DIAGNOSTIC_TOOLS.slice(3, 6).map((tool) => {
                  const val = vitals[tool.key];
                  const displayVal = val !== undefined ? tool.format(val, vitals) : "—";
                  const revealed  = revealedVitals.has(tool.key);
                  const measuring = measuringVitals.has(tool.key);
                  return (
                    <button
                      key={tool.key}
                      onClick={() => handleMeasureVital(tool.key)}
                      disabled={revealed || measuring}
                      className="flex flex-col items-stretch text-left"
                      style={{
                        width: "138px", gap: "6px",
                        background: "none", border: "none", padding: 0,
                        cursor: revealed || measuring ? "default" : "pointer",
                      }}
                      title={revealed ? undefined : "Click to measure"}
                    >
                      <div className={measuring ? "vital-measuring" : ""} style={{ height: "138px", position: "relative", filter: "drop-shadow(0px 4px 10px rgba(0,60,117,0.7))" }}>
                        <Image src={tool.image} alt={tool.label} fill className="object-cover" />
                      </div>
                      <span className="text-center" style={{ color: "#FFFFFF", fontSize: "20px", fontFamily: "'Gochi Hand', cursive", textShadow: "0px 4px 10px rgba(0,60,117,1)" }}>
                        {tool.label}
                      </span>
                      <span className={`text-center${revealed ? " vital-reveal" : ""}`} style={{ color: "#FFFFFF", fontSize: "36px", fontFamily: "'Gochi Hand', cursive", lineHeight: "1.18em", textShadow: "0px 4px 10px rgba(0,60,117,1)", minHeight: "42px" }}>
                        {measuring ? <StaggeredDots /> : revealed ? displayVal : "?"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Panel */}
            <div
              className="flex flex-col justify-center"
              style={{
                borderRadius: "24px",
                padding: "24px",
                gap: "16px",
                backgroundImage: "url('/chat/submit-panel-bg-174c22.png')",
                backgroundSize: "100% 100%",
                backgroundRepeat: "no-repeat",
                border: "5px solid rgba(255,255,255,1)",
                boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
              }}
            >
              <p
                className="text-center"
                style={{
                  color: "#FAFAFA",
                  fontSize: "22px",
                  fontFamily: "'Gochi Hand', cursive",
                  lineHeight: "1.18em",
                  opacity: 0.88,
                }}
              >
                End the chat session and send the full conversation to the backend for the report.
              </p>

              {/* Submit Diagnosis button */}
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  void handleEndSession();
                }}
                className="flex items-center justify-between transition-opacity hover:opacity-90"
                style={{
                  background: "#21B842",
                  border: "2px solid #000300",
                  borderRadius: "8px",
                  padding: "12px 12px 12px 20px",
                }}
              >
                <span
                  style={{
                    color: "#FFFFFF",
                    fontSize: "24px",
                    fontWeight: 700,
                    fontFamily: "Inter, sans-serif",
                    lineHeight: "1.21em",
                  }}
                >
                  SUBMIT DIAGNOSIS
                </span>
                <span style={{ fontSize: "28px" }}>{endingSession ? "…" : "➤"}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function ConversationPage() {
  return (
    <Suspense>
      <ConversationContent />
    </Suspense>
  );
}
