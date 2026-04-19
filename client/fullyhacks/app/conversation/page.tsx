"use client";

import { useState, Suspense } from "react";
import { useScribe } from "@elevenlabs/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const BUBBLES: [number, number, number, number][] = [
  [10,  5,  0,   9],
  [18, 15,  3,  13],
  [8,  28,  1,   7],
  [22, 42,  5,  14],
  [14, 60,  2,  11],
  [20, 74,  6,  13],
  [10, 88,  0.5, 9],
];

// ── Fetch a single-use token from our server API route ───────────────────────
async function fetchScribeToken(): Promise<string> {
  const res = await fetch("/api/scribe-token");
  if (!res.ok) throw new Error("Failed to fetch scribe token");
  const data = await res.json();
  return data.token as string;
}

// ── Conversation page content ────────────────────────────────────────────────
function ConversationContent() {
  const params = useSearchParams();
  const disease = params.get("disease") ?? "Unknown";

  const [connectError, setConnectError] = useState<string | null>(null);

  const {
    status,
    connect,
    disconnect,
    committedTranscripts,
    partialTranscript,
    clearTranscripts,
    error: scribeError,
  } = useScribe({
    modelId: "scribe_v2_realtime",
    microphone: {},
    onError: (err) => {
      const msg = err instanceof Error ? err.message : "Connection error";
      setConnectError(msg);
    },
  });

  const isListening = status === "connected" || status === "transcribing";
  const isConnecting = status === "connecting";

  async function handleToggle() {
    setConnectError(null);
    if (isListening) {
      disconnect();
    } else {
      try {
        const token = await fetchScribeToken();
        await connect({ token });
      } catch (err) {
        setConnectError(err instanceof Error ? err.message : "Failed to connect");
      }
    }
  }

  // Build full transcript from committed segments + live partial
  const committed = committedTranscripts.map((s) => s.text).join(" ");
  const displayText = committed + (partialTranscript ? " " + partialTranscript : "");

  const statusLabel =
    status === "connecting"    ? "Connecting…" :
    status === "connected"     ? "Listening…" :
    status === "transcribing"  ? "Transcribing…" :
    status === "error"         ? "Error" :
    "Press the mic to start";

  const errorMsg = connectError ?? scribeError;

  return (
    <main
      className="relative flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, #0d3b6e 0%, #0e2a4a 40%, #0a1628 100%)",
      }}
    >
      {/* Bubbles */}
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

      {/* Ocean floor glow */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 h-32 z-0"
        style={{ background: "linear-gradient(to top, rgba(8,145,178,0.08), transparent)" }}
      />

      {/* Card */}
      <div className="relative z-10 ocean-card rounded-2xl p-8 flex flex-col gap-6 w-full max-w-xl">

        {/* Disease badge */}
        <div className="flex justify-center">
          <span
            className="px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide uppercase"
            style={{
              background: "rgba(8,145,178,0.2)",
              border: "1px solid rgba(34,211,238,0.3)",
              color: "#22d3ee",
            }}
          >
            {disease}
          </span>
        </div>

        {/* Title */}
        <div className="text-center flex flex-col gap-1">
          <h1 className="text-2xl font-bold" style={{ color: "#e0f4f8" }}>
            Speech to Text
          </h1>
          <p className="text-xs" style={{ color: "#4a8fa8" }}>
            Powered by ElevenLabs Scribe
          </p>
        </div>

        {/* Mic button */}
        <div className="flex justify-center">
          <button
            onClick={handleToggle}
            disabled={isConnecting}
            aria-label={isListening ? "Stop listening" : "Start listening"}
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all duration-200"
            style={
              isListening
                ? {
                    background: "rgba(239,68,68,0.2)",
                    border: "2px solid #ef4444",
                    boxShadow: "0 0 28px rgba(239,68,68,0.45)",
                    cursor: "pointer",
                  }
                : isConnecting
                ? {
                    background: "rgba(251,191,36,0.15)",
                    border: "2px solid rgba(251,191,36,0.4)",
                    boxShadow: "0 0 16px rgba(251,191,36,0.2)",
                    cursor: "wait",
                  }
                : {
                    background: "rgba(8,145,178,0.2)",
                    border: "2px solid rgba(34,211,238,0.4)",
                    boxShadow: "0 0 16px rgba(34,211,238,0.2)",
                    cursor: "pointer",
                  }
            }
          >
            {isConnecting ? "⏳" : isListening ? "⏹" : "🎙️"}
          </button>
        </div>

        {/* Status label */}
        <p
          className="text-center text-xs"
          style={{
            color:
              isListening   ? "#22d3ee" :
              isConnecting  ? "#fbbf24" :
              status === "error" ? "#f87171" :
              "#4a8fa8",
          }}
        >
          {statusLabel}
        </p>

        {/* Transcript box */}
        <div
          className="rounded-xl p-4 min-h-32 text-sm leading-relaxed"
          style={{
            background: "rgba(10,22,40,0.6)",
            border: "1px solid rgba(34,211,238,0.12)",
            color: displayText.trim() ? "#e0f4f8" : "#2a5f72",
          }}
        >
          {displayText.trim() || "Transcript will appear here…"}
        </div>

        {/* Error */}
        {errorMsg && (
          <p className="text-xs text-center" style={{ color: "#f87171" }}>
            ⚠ {errorMsg}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => { clearTranscripts(); setConnectError(null); }}
            disabled={!displayText.trim()}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: "rgba(13,59,110,0.4)",
              border: "1px solid rgba(34,211,238,0.15)",
              color: displayText.trim() ? "#7dd3e8" : "#2a5f72",
              cursor: displayText.trim() ? "pointer" : "not-allowed",
            }}
          >
            Clear
          </button>
          <Link
            href="/setup"
            className="flex-1 py-2 rounded-lg text-sm font-medium text-center transition-all"
            style={{
              background: "rgba(13,59,110,0.4)",
              border: "1px solid rgba(34,211,238,0.15)",
              color: "#7dd3e8",
            }}
          >
            ← Back
          </Link>
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
