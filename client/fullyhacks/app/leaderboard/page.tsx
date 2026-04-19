"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fetchCompetitionDates, fetchLeaderboard } from "@/lib/api";
import { LeaderboardEntry, LeaderboardResponse } from "@/types/scenario";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const [dates, setDates] = useState<string[] | null>(null);
  const [datesError, setDatesError] = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const datesLoading = !!session?.backendToken && dates === null && datesError === null;

  useEffect(() => {
    const token = session?.backendToken;
    if (!token) return;
    fetchCompetitionDates(token)
      .then((res) => setDates(res.dates))
      .catch((err) => setDatesError(err instanceof Error ? err.message : "Failed to load dates"));
  }, [session?.backendToken]);

  function handleSelectDate(date: string) {
    const token = session?.backendToken;
    if (!token) return;
    setSelectedDate(date);
    setLeaderboard(null);
    setLeaderboardError(null);
    setLeaderboardLoading(true);
    fetchLeaderboard(token, date)
      .then((res) => { setLeaderboard(res); setLeaderboardLoading(false); })
      .catch((err) => {
        setLeaderboardError(err instanceof Error ? err.message : "Failed to load leaderboard");
        setLeaderboardLoading(false);
      });
  }

  function handleBack() {
    setSelectedDate(null);
    setLeaderboard(null);
    setLeaderboardError(null);
  }

  return (
    <main
      className="relative flex flex-col items-center min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% -10%, #0d3b6e 0%, #0a1e3d 35%, #060e1f 100%)",
      }}
    >
      {/* Ocean floor glow */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0"
        style={{
          height: "220px",
          background: "linear-gradient(to top, rgba(8,145,178,0.12) 0%, transparent 100%)",
        }}
      />

      {/* Nav */}
      <nav
        className="relative z-10 w-full flex items-center justify-between px-8 py-5"
        style={{ borderBottom: "1px solid rgba(34,211,238,0.08)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xl">🐚</span>
          <span className="text-sm font-semibold tracking-wide" style={{ color: "#7dd3e8" }}>
            VPP
          </span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="text-xs px-3 py-1 rounded-full transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#bae6fd",
            cursor: "pointer",
          }}
        >
          ← Back to Home
        </button>
      </nav>

      <section className="relative z-10 w-full max-w-2xl mx-auto px-6 pt-12 pb-20">

        {/* Page header */}
        <div className="text-center mb-10">
          <p className="text-4xl mb-3">🏆</p>
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: "#22d3ee", textShadow: "0 0 40px rgba(34,211,238,0.2)" }}
          >
            Leaderboards
          </h1>
          <p className="text-sm mt-2" style={{ color: "#7dd3e8" }}>
            {selectedDate
              ? "Scores for the selected competition day."
              : "Select a past competition to see how everyone ranked."}
          </p>
        </div>

        {/* ── Date list view ── */}
        {!selectedDate && (
          <>
            {datesLoading && (
              <p className="text-center text-sm animate-pulse" style={{ color: "#7dd3e8" }}>
                Loading competitions...
              </p>
            )}

            {datesError && (
              <div
                className="rounded-xl p-4 text-center"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <p className="text-sm" style={{ color: "#f87171" }} role="alert">
                  {datesError}
                </p>
              </div>
            )}

            {!datesLoading && !datesError && dates && dates.length === 0 && (
              <div className="ocean-card rounded-2xl p-10 text-center">
                <p className="text-3xl mb-3">🌊</p>
                <p className="text-sm" style={{ color: "#7dd3e8" }}>
                  No competitions have been held yet.
                </p>
              </div>
            )}

            {!datesLoading && !datesError && dates && dates.length > 0 && (
              <div className="ocean-card rounded-2xl overflow-hidden">
                {/* Column header */}
                <div
                  className="px-5 py-3 text-xs font-semibold uppercase tracking-widest"
                  style={{
                    color: "#4a8fa8",
                    borderBottom: "1px solid rgba(34,211,238,0.1)",
                    background: "rgba(13,59,110,0.4)",
                  }}
                >
                  Competition Date
                </div>

                {dates.map((date, idx) => (
                  <button
                    key={date}
                    type="button"
                    onClick={() => handleSelectDate(date)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left transition-colors"
                    style={{
                      borderBottom:
                        idx < dates.length - 1 ? "1px solid rgba(34,211,238,0.06)" : "none",
                      background: "transparent",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "rgba(34,211,238,0.05)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">📅</span>
                      <span className="text-sm font-medium" style={{ color: "#bae6fd" }}>
                        {formatDate(date)}
                      </span>
                    </div>
                    <span className="text-xs" style={{ color: "#22d3ee" }}>
                      View →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── Day leaderboard view ── */}
        {selectedDate && (
          <>
            {/* Back + date label */}
            <div className="flex items-center gap-3 mb-6">
              <button
                type="button"
                onClick={handleBack}
                className="text-xs px-3 py-1.5 rounded-lg transition-all"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#7dd3e8",
                  cursor: "pointer",
                }}
              >
                ← All dates
              </button>
              <span className="text-sm" style={{ color: "#4a8fa8" }}>
                {formatDate(selectedDate)}
              </span>
            </div>

            {leaderboardLoading && (
              <p className="text-center text-sm animate-pulse" style={{ color: "#7dd3e8" }}>
                Loading leaderboard...
              </p>
            )}

            {leaderboardError && (
              <div
                className="rounded-xl p-4 text-center"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <p className="text-sm" style={{ color: "#f87171" }} role="alert">
                  {leaderboardError}
                </p>
              </div>
            )}

            {!leaderboardLoading && !leaderboardError && leaderboard && leaderboard.entries.length === 0 && (
              <div className="ocean-card rounded-2xl p-10 text-center">
                <p className="text-3xl mb-3">🌊</p>
                <p className="text-sm" style={{ color: "#7dd3e8" }}>
                  No completed submissions for this day.
                </p>
              </div>
            )}

            {!leaderboardLoading && !leaderboardError && leaderboard && leaderboard.entries.length > 0 && (
              <div className="ocean-card rounded-2xl overflow-hidden">
                {/* Table header */}
                <div
                  className="grid grid-cols-12 px-5 py-3 text-xs font-semibold uppercase tracking-widest"
                  style={{
                    color: "#4a8fa8",
                    borderBottom: "1px solid rgba(34,211,238,0.1)",
                    background: "rgba(13,59,110,0.4)",
                  }}
                >
                  <span className="col-span-1">#</span>
                  <span className="col-span-7">Student</span>
                  <span className="col-span-2 text-right">Score</span>
                  <span className="col-span-2 text-right">Time</span>
                </div>

                {leaderboard.entries.map((entry: LeaderboardEntry, idx: number) => {
                  const isTop3 = entry.rank <= 3;
                  const completedTime = new Date(entry.completed_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-12 items-center px-5 py-4"
                      style={{
                        borderBottom:
                          idx < leaderboard.entries.length - 1
                            ? "1px solid rgba(34,211,238,0.06)"
                            : "none",
                        background: isTop3 ? "rgba(34,211,238,0.04)" : "transparent",
                      }}
                    >
                      <span className="col-span-1 text-base">
                        {MEDAL[entry.rank] ?? (
                          <span className="text-sm" style={{ color: "#4a8fa8" }}>
                            {entry.rank}
                          </span>
                        )}
                      </span>

                      <span
                        className="col-span-7 text-sm font-medium truncate"
                        style={{ color: isTop3 ? "#e0f4f8" : "#7dd3e8" }}
                      >
                        {entry.user_name}
                      </span>

                      <span
                        className="col-span-2 text-right text-sm font-semibold"
                        style={{
                          color:
                            entry.score >= 80
                              ? "#22c55e"
                              : entry.score >= 60
                              ? "#fbbf24"
                              : "#f87171",
                        }}
                      >
                        {entry.score}/100
                      </span>

                      <span
                        className="col-span-2 text-right text-xs"
                        style={{ color: "#4a8fa8" }}
                      >
                        {completedTime}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
