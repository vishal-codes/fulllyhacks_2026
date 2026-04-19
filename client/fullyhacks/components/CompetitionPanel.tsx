"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fetchCompetitionStatus, startCompetition } from "@/lib/api";
import { CompetitionStatusResponse } from "@/types/scenario";

function parseVitalsToParams(vitals: Record<string, string | number>) {
  const num = (val: string | number | undefined) =>
    val !== undefined ? parseFloat(String(val)) : undefined;

  const bpRaw = vitals["BP"] ? String(vitals["BP"]).split("/") : [];
  const bpSys = bpRaw[0] ? parseFloat(bpRaw[0]) : undefined;
  const bpDia = bpRaw[1] ? parseFloat(bpRaw[1]) : undefined;

  const params: Record<string, string> = {};
  if (bpSys !== undefined && !isNaN(bpSys)) params.bp_sys = String(bpSys);
  if (bpDia !== undefined && !isNaN(bpDia)) params.bp_dia = String(bpDia);
  const hr = num(vitals["HR"]);
  const temp = num(vitals["Temp"]);
  const spo2 = num(vitals["SpO2"]);
  const rr = num(vitals["RR"]);
  const pain = num(vitals["Pain"]);
  if (hr !== undefined && !isNaN(hr)) params.hr = String(hr);
  if (temp !== undefined && !isNaN(temp)) params.temp = String(temp);
  if (spo2 !== undefined && !isNaN(spo2)) params.spo2 = String(spo2);
  if (rr !== undefined && !isNaN(rr)) params.rr = String(rr);
  if (pain !== undefined && !isNaN(pain)) params.pain = String(pain);
  return params;
}

export default function CompetitionPanel() {
  const router = useRouter();
  const { data: session } = useSession();
  const [status, setStatus] = useState<CompetitionStatusResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loading = !!session?.backendToken && status === null && error === null;

  useEffect(() => {
    const token = session?.backendToken;
    if (!token) {
      return;
    }

    fetchCompetitionStatus(token)
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load competition"))
  }, [session?.backendToken]);

  async function handleStart() {
    const token = session?.backendToken;
    if (!token) {
      setError("You must be logged in before starting the competition.");
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const competition = await startCompetition(token);
      const params = new URLSearchParams({
        session_id: competition.session_id,
        mode: "competition",
        competition_date: competition.competition_date,
        ...parseVitalsToParams(competition.vitals),
      });
      router.push(`/conversation?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start competition");
      setStarting(false);
    }
  }

  const disabled = loading || starting || status?.has_started;

  return (
    <div className="ocean-card rounded-2xl p-8 w-full max-w-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "#bae6fd" }}>
            Daily Competition
          </h2>
          <p className="text-sm mt-1" style={{ color: "#7dd3e8" }}>
            One shared patient for everyone, once per day.
          </p>
        </div>
        <span
          className="text-xs px-3 py-1 rounded-full"
          style={{
            background: "rgba(34,211,238,0.08)",
            border: "1px solid rgba(34,211,238,0.15)",
            color: "#22d3ee",
          }}
        >
          Today
        </span>
      </div>

      <div
        className="rounded-xl p-4 mb-5"
        style={{
          background: "rgba(13,59,110,0.35)",
          border: "1px solid rgba(34,211,238,0.15)",
        }}
      >
        {loading && (
          <p className="text-sm animate-pulse" style={{ color: "#7dd3e8" }}>
            Loading today&apos;s challenge...
          </p>
        )}

        {!loading && status && (
          <>
            <p className="text-sm mb-2" style={{ color: "#7dd3e8" }}>
              Competition date: {status.competition_date}
            </p>
            <p className="text-sm" style={{ color: "#e0f4f8" }}>
              Patient: {status.patient_preview.name}, {status.patient_preview.age}-year-old {status.patient_preview.gender.toLowerCase()}
            </p>
            <p className="text-xs mt-3" style={{ color: "#4a8fa8" }}>
              Everyone gets the same hidden disease and symptom profile for the day.
            </p>
            {status.has_started && (
              <p className="text-xs mt-3" style={{ color: status.has_completed ? "#22c55e" : "#fbbf24" }}>
                {status.has_completed
                  ? "You already completed today&apos;s competition."
                  : "You already started today&apos;s competition."}
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={handleStart}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-150"
        style={{
          background: disabled ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #f59e0b, #ef4444)",
          color: disabled ? "#4a8fa8" : "#fff7ed",
          border: disabled ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(251,191,36,0.35)",
          cursor: disabled ? "not-allowed" : "pointer",
          boxShadow: disabled ? "none" : "0 12px 24px rgba(239,68,68,0.18)",
        }}
      >
        {starting ? "Starting..." : status?.has_started ? "Already Played Today" : "Start Competition"}
      </button>

      {error && (
        <p className="text-xs mt-3" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </div>
  );
}
