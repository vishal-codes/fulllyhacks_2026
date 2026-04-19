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
    <div
      className="w-full p-8 flex flex-col justify-between"
      style={{
        borderRadius: "24px",
        border: "2px solid rgba(255,255,255,1)",
        boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
        background: "rgba(9,9,11,0.55)",
        backdropFilter: "blur(100px)",
        WebkitBackdropFilter: "blur(100px)",
      }}
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}>
            Daily Competition
          </h2>
          <p className="text-lg mt-1" style={{ color: "rgba(250,250,250,0.6)", fontFamily: "'Gochi Hand', cursive" }}>
            One shared patient for everyone, once per day.
          </p>
        </div>
      </div>

      <div
        className="rounded-xl p-4 mb-5"
        style={{
          background: "rgba(250,250,250,0.06)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        {loading && (
          <p className="text-lg animate-pulse" style={{ color: "rgba(250,250,250,0.5)", fontFamily: "'Gochi Hand', cursive" }}>
            {"Loading today's challenge..."}
          </p>
        )}

        {!loading && status && (
          <>
            <p className="text-lg mb-2" style={{ color: "rgba(250,250,250,0.6)", fontFamily: "'Gochi Hand', cursive" }}>
              Competition date: {status.competition_date}
            </p>
            <p className="text-lg" style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}>
              Patient: {status.patient_preview.name}, {status.patient_preview.age}-year-old {status.patient_preview.gender.toLowerCase()}
            </p>
            <p className="text-base mt-3" style={{ color: "rgba(250,250,250,0.35)", fontFamily: "'Gochi Hand', cursive" }}>
              Everyone gets the same hidden disease and symptom profile for the day.
            </p>
            {status.has_started && (
              <p className="text-base mt-3" style={{ color: status.has_completed ? "#22c55e" : "#fbbf24", fontFamily: "'Gochi Hand', cursive" }}>
                {status.has_completed
                  ? "You already completed today's competition."
                  : "You already started today's competition."}
              </p>
            )}
            {status.has_completed && status.attempt?.score != null && (
              <p className="text-base mt-2" style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}>
                {"Today's score: "}{status.attempt.score}/100
              </p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={handleStart}
        className="w-full py-3 rounded-xl font-semibold transition-all duration-150 flex items-center justify-between"
        style={{
          background: disabled ? "rgba(250,250,250,0.06)" : "rgba(255,140,0,0.9)",
          color: disabled ? "rgba(250,250,250,0.3)" : "#FAFAFA",
          border: disabled ? "1px solid rgba(255,255,255,0.1)" : "2px solid #FF8C00",
          borderRadius: "12px",
          padding: "12px 16px 12px 20px",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: "'Gochi Hand', cursive",
          fontSize: "22px",
        }}
      >
        <span>{starting ? "Starting..." : status?.has_started ? "Already Played Today" : "Start Competition"}</span>
        {!disabled && <span style={{ color: "#FAFAFA", fontSize: "24px", fontWeight: "bold" }}>➤</span>}
      </button>

      {error && (
        <p className="text-xs mt-3" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
    </div>
  );
}
