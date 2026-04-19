"use client";

import { useState, useRef, Suspense } from "react";
import { useScribe } from "@elevenlabs/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { sendChatMessage } from "@/lib/api";

const BUBBLES: [number, number, number, number][] = [
  [10,  5,  0,   9],
  [18, 15,  3,  13],
  [8,  28,  1,   7],
  [22, 42,  5,  14],
  [14, 60,  2,  11],
  [20, 74,  6,  13],
  [10, 88,  0.5, 9],
];

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

type InputMode = "mic" | "text";

function ConversationContent() {
  const params  = useSearchParams();
  const disease = params.get("disease") ?? "Unknown";

  // ── Input mode toggle ────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>("mic");

  // ── Chat history ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError,   setChatError]   = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  function clearHistory() {
    setMessages([]);
    setChatError(null);
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
      const res = await sendChatMessage(trimmed);
      appendMessage({ role: "patient", text: res.response });
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setChatLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  // ── Text input state ─────────────────────────────────────────────────────
  const [textInput, setTextInput] = useState("");

  function handleTextSend() {
    if (!textInput.trim() || chatLoading) return;
    submitToChat(textInput);
    setTextInput("");
  }

  function handleTextKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSend(); }
  }

  // ── ElevenLabs Scribe ────────────────────────────────────────────────────
  const [scribeError,      setScribeError]      = useState<string | null>(null);
  const [displayTranscript, setDisplayTranscript] = useState<string>("");
  const accumulatedTextRef = useRef<string>("");
  const partialTextRef     = useRef<string>("");

  const {
    status,
    connect,
    disconnect,
    clearTranscripts,
    error: scribeHookError,
  } = useScribe({
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

  const isListening  = status === "connected" || status === "transcribing";
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
      if (text) await submitToChat(text);
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

  const errorMsg = scribeError ?? scribeHookError;

  return (
    <main
      className="relative flex flex-col items-center justify-center min-h-screen px-4 py-10 overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #0d3b6e 0%, #0e2a4a 40%, #0a1628 100%)",
      }}
    >
      {BUBBLES.map(([size, left, delay, duration], i) => (
        <span key={i} className="bubble" style={{
          width: size, height: size, left: `${left}%`,
          animationDelay: `${delay}s`, animationDuration: `${duration}s`,
        }} />
      ))}
      <div className="pointer-events-none fixed bottom-0 left-0 right-0 h-32 z-0"
        style={{ background: "linear-gradient(to top, rgba(8,145,178,0.08), transparent)" }} />

      <div className="relative z-10 flex flex-col w-full max-w-xl ocean-card rounded-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid rgba(34,211,238,0.1)" }}>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase"
              style={{ background: "rgba(8,145,178,0.2)", border: "1px solid rgba(34,211,238,0.3)", color: "#22d3ee" }}>
              {disease}
            </span>
            <span className="text-sm font-semibold" style={{ color: "#bae6fd" }}>Patient Consultation</span>
          </div>
          <div className="flex items-center gap-4">
            {messages.length > 0 && (
              <button onClick={clearHistory} className="text-xs transition-colors"
                style={{ color: "#2a5f72" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#f87171"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#2a5f72"; }}>
                Clear history
              </button>
            )}
            <Link href="/setup" className="text-xs transition-colors" style={{ color: "#4a8fa8" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#22d3ee"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#4a8fa8"; }}>
              ← Back
            </Link>
          </div>
        </div>

        {/* ── Chat history ── */}
        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5"
          style={{ minHeight: "300px", maxHeight: "400px", scrollbarWidth: "thin", scrollbarColor: "rgba(34,211,238,0.2) transparent" }}>
          {messages.length === 0 && (
            <p className="text-xs italic text-center mt-8" style={{ color: "#2a5f72" }}>
              {inputMode === "mic" ? "Press the mic and speak to begin." : "Type a message to begin."}
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className="flex flex-col gap-1"
              style={{ alignItems: m.role === "student" ? "flex-end" : "flex-start" }}>
              <span className="text-xs px-1" style={{ color: "#2a5f72" }}>
                {m.role === "student" ? "You" : "Patient"}
              </span>
              <div className="px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                style={m.role === "student"
                  ? { background: "rgba(8,145,178,0.35)", color: "#e0f4f8", borderBottomRightRadius: "4px", maxWidth: "80%" }
                  : { background: "rgba(13,59,110,0.7)", color: "#bae6fd", border: "1px solid rgba(34,211,238,0.12)", borderBottomLeftRadius: "4px", maxWidth: "80%" }}>
                {m.text}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex flex-col gap-1" style={{ alignItems: "flex-start" }}>
              <span className="text-xs px-1" style={{ color: "#2a5f72" }}>Patient</span>
              <div className="px-4 py-2.5 rounded-2xl text-sm animate-pulse"
                style={{ background: "rgba(13,59,110,0.7)", color: "#4a8fa8", border: "1px solid rgba(34,211,238,0.12)", borderBottomLeftRadius: "4px" }}>
                …
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* ── Mode toggle tabs ── */}
        <div className="flex px-6 gap-2 pt-3"
          style={{ borderTop: "1px solid rgba(34,211,238,0.1)" }}>
          {(["mic", "text"] as InputMode[]).map((mode) => (
            <button key={mode} onClick={() => setInputMode(mode)}
              className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={inputMode === mode
                ? { background: "rgba(8,145,178,0.3)", border: "1px solid rgba(34,211,238,0.4)", color: "#22d3ee" }
                : { background: "transparent", border: "1px solid rgba(34,211,238,0.1)", color: "#4a8fa8" }}>
              {mode === "mic" ? "🎙️ Voice" : "⌨️ Text"}
            </button>
          ))}
        </div>

        {/* ── Mic input ── */}
        {inputMode === "mic" && (
          <div className="flex flex-col items-center gap-3 px-6 py-5">
            {/* Live transcript preview */}
            {(isListening || displayTranscript) && (
              <div className="w-full px-4 py-2 rounded-xl text-xs leading-relaxed"
                style={{
                  background: "rgba(10,22,40,0.5)",
                  border: `1px solid ${isListening ? "rgba(239,68,68,0.25)" : "rgba(34,211,238,0.1)"}`,
                  color: displayTranscript ? "#7dd3e8" : "#2a5f72",
                  fontStyle: displayTranscript ? "normal" : "italic",
                }}>
                {displayTranscript || "Listening…"}
              </div>
            )}

            {/* Step indicators */}
            <div className="flex items-center gap-2 justify-center">
              {[
                { n: 1, label: "Speak",    active: isListening || isConnecting, color: isListening ? "#ef4444" : "#fbbf24", bg: isListening ? "rgba(239,68,68,0.25)" : "rgba(251,191,36,0.2)" },
                { n: 2, label: chatLoading ? "Sending…" : "Send", active: chatLoading, color: "#fbbf24", bg: "rgba(251,191,36,0.2)" },
                { n: 3, label: "Response", active: !chatLoading && messages.at(-1)?.role === "patient", color: "#22d3ee", bg: "rgba(34,211,238,0.15)" },
              ].map((s, idx) => (
                <div key={s.n} className="flex items-center gap-2">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                      style={{ background: s.active ? s.bg : "rgba(34,211,238,0.05)", border: `1px solid ${s.active ? s.color : "rgba(34,211,238,0.15)"}`, color: s.active ? s.color : "#2a5f72" }}>
                      {s.n}
                    </div>
                    <span className="text-xs" style={{ color: s.active ? s.color : "#2a5f72" }}>{s.label}</span>
                  </div>
                  {idx < 2 && <div className="h-px w-8 mb-4" style={{ background: "rgba(34,211,238,0.1)" }} />}
                </div>
              ))}
            </div>

            {/* Mic button */}
            <div className="relative flex items-center justify-center">
              {isListening && (
                <span className="absolute rounded-full animate-ping"
                  style={{ width: "72px", height: "72px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }} />
              )}
              <button onClick={handleMicToggle} disabled={isConnecting || chatLoading}
                aria-label={isListening ? "Stop and send" : "Start speaking"}
                className="relative w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all duration-200"
                style={isListening
                  ? { background: "rgba(239,68,68,0.25)", border: "2px solid #ef4444", boxShadow: "0 0 28px rgba(239,68,68,0.5)", cursor: "pointer" }
                  : isConnecting || chatLoading
                  ? { background: "rgba(251,191,36,0.1)", border: "2px solid rgba(251,191,36,0.3)", cursor: "not-allowed", opacity: 0.6 }
                  : { background: "rgba(8,145,178,0.2)", border: "2px solid rgba(34,211,238,0.4)", boxShadow: "0 0 16px rgba(34,211,238,0.2)", cursor: "pointer" }}>
                {isConnecting ? "⏳" : chatLoading ? "📡" : isListening ? "⏹" : "🎙️"}
              </button>
            </div>

            <p className="text-xs text-center font-medium"
              style={{ color: isListening ? "#ef4444" : isConnecting || chatLoading ? "#fbbf24" : "#4a8fa8" }}>
              {isConnecting ? "🔄 Connecting…" : isListening ? "🔴 Recording — press ⏹ to send" : chatLoading ? "📡 Sending…" : "🎙️ Press to speak"}
            </p>

            {(errorMsg || chatError) && (
              <p className="text-xs text-center" style={{ color: "#f87171" }}>⚠ {errorMsg ?? chatError}</p>
            )}
          </div>
        )}

        {/* ── Text input ── */}
        {inputMode === "text" && (
          <div className="flex flex-col gap-3 px-6 py-5">
            {chatError && (
              <p className="text-xs" style={{ color: "#f87171" }}>⚠ {chatError}</p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleTextKeyDown}
                placeholder="Ask the patient something…"
                disabled={chatLoading}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{ background: "rgba(10,22,40,0.6)", border: "1px solid rgba(34,211,238,0.2)", color: "#e0f4f8" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#22d3ee"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(34,211,238,0.12)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "rgba(34,211,238,0.2)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button onClick={handleTextSend}
                disabled={!textInput.trim() || chatLoading}
                className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: textInput.trim() && !chatLoading ? "linear-gradient(135deg, #0891b2, #0e7490)" : "rgba(13,59,110,0.4)",
                  color: textInput.trim() && !chatLoading ? "#e0f4f8" : "#2a5f72",
                  cursor: textInput.trim() && !chatLoading ? "pointer" : "not-allowed",
                }}>
                {chatLoading ? "…" : "Send"}
              </button>
            </div>
          </div>
        )}

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
