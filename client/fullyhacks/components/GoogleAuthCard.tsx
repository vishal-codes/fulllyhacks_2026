"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

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

export default function GoogleAuthCard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Sign-in failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4"
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

      <div className="relative z-10 ocean-card flex w-full max-w-sm flex-col items-center gap-7 rounded-2xl p-10">
        <div className="flex flex-col items-center gap-3">
          <div className="text-5xl select-none">🐚</div>
          <h1 className="text-3xl font-bold" style={{ color: "#22d3ee" }}>
            Virtual Patient
          </h1>
          <p className="text-center text-sm" style={{ color: "#7dd3e8" }}>
            Register or log in with Google to access the home screen and start consultations.
          </p>
        </div>

        <div className="h-px w-full" style={{ background: "rgba(34,211,238,0.12)" }} />

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl px-5 py-3 text-sm font-medium transition-all duration-150"
          style={{
            background: loading ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: loading ? "#4a8fa8" : "#e0f4f8",
            cursor: loading ? "not-allowed" : "pointer",
            boxShadow: loading ? "none" : "0 2px 12px rgba(34,211,238,0.1)",
          }}
        >
          {!loading && (
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.2l6.8-6.8C35.8 2.5 30.2 0 24 0 14.7 0 6.8 5.4 2.8 13.3l7.9 6.1C12.6 13.2 17.8 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.2-10.1 7.2-17z"/>
              <path fill="#FBBC05" d="M10.7 28.5C10.2 27 10 25.5 10 24s.2-3 .7-4.5L2.8 13.3C1 16.9 0 20.8 0 24s1 7.1 2.8 10.7l7.9-6.2z"/>
              <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.5-5.8c-2.1 1.4-4.7 2.3-7.7 2.3-6.2 0-11.4-3.7-13.3-9l-7.9 6.1C6.8 42.6 14.7 48 24 48z"/>
            </svg>
          )}
          {loading ? "Signing in..." : "Continue with Google"}
        </button>

        {error && (
          <p className="text-center text-xs" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}

        <p className="text-center text-xs" style={{ color: "#2a5f72" }}>
          For educational use only. Not a diagnostic tool.
        </p>
      </div>
    </main>
  );
}
