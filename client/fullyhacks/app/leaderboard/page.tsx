"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { fetchCompetitionDates, fetchLeaderboard } from "@/lib/api";
import { LeaderboardEntry, LeaderboardResponse } from "@/types/scenario";

const FONT = "'Gochi Hand', cursive";
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

  const panelStyle: React.CSSProperties = {
    borderRadius: "24px",
    border: "2px solid rgba(255,255,255,1)",
    boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
    background: "rgba(9,9,11,0.55)",
    backdropFilter: "blur(100px)",
    WebkitBackdropFilter: "blur(100px)",
    overflow: "hidden",
  };

  return (
    <main
      className="relative flex flex-col"
      style={{
        fontFamily: FONT,
        backgroundImage: "url('/chat/Single-Celled_Defense_196.webp')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* ── Gradient overlay ── */}
      <div
        className="absolute inset-0 z-0 pointer-events-none"
        style={{ background: "rgba(0,0,0,0.75)" }}
      />

      {/* ── Nav bar ── */}
      <nav
        className="relative z-50 w-full flex-shrink-0 flex items-center justify-between px-6 py-3"
        style={{
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          background: "rgba(250,250,250,0.05)",
          borderBottom: "1px solid rgba(250,250,250,0.1)",
        }}
      >
        <span style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "20px" }}>
          🏆 Leaderboards
        </span>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="px-4 py-1.5 rounded-full transition-opacity hover:opacity-70"
          style={{
            background: "rgba(250,250,250,0.08)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#FAFAFA",
            fontFamily: FONT,
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          ← Home
        </button>
      </nav>

      {/* ── Scrollable content ── */}
      <section
        className="relative z-10 flex-1 w-full overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}
      >
        <div className="flex flex-col items-center px-6 pt-12 pb-12 gap-8 w-full max-w-2xl mx-auto">

          {/* Page header */}
          <div className="text-center">
            <h1
              className="text-5xl font-bold"
              style={{ color: "#FAFAFA", fontFamily: FONT, textShadow: "0px 4px 20px rgba(0,60,117,0.6)" }}
            >
              Leaderboards
            </h1>
            <p className="text-xl mt-2" style={{ color: "rgba(250,250,250,0.6)", fontFamily: FONT }}>
              {selectedDate
                ? "Scores for the selected competition day."
                : "Select a past competition to see how everyone ranked."}
            </p>
          </div>

          {/* ── Date list view ── */}
          {!selectedDate && (
            <div className="w-full">
              {datesLoading && (
                <p className="text-center animate-pulse" style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "20px" }}>
                  Loading competitions...
                </p>
              )}

              {datesError && (
                <div style={{ ...panelStyle, padding: "16px", textAlign: "center" }}>
                  <p style={{ color: "#f87171", fontFamily: FONT, fontSize: "18px" }} role="alert">{datesError}</p>
                </div>
              )}

              {!datesLoading && !datesError && dates && dates.length === 0 && (
                <div style={{ ...panelStyle, padding: "40px", textAlign: "center" }}>
                  <p className="text-3xl mb-3">🌊</p>
                  <p style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "20px" }}>
                    No competitions have been held yet.
                  </p>
                </div>
              )}

              {!datesLoading && !datesError && dates && dates.length > 0 && (
                <div style={panelStyle}>
                  {/* Column header */}
                  <div
                    className="px-5 py-3 uppercase tracking-widest"
                    style={{
                      color: "rgba(250,250,250,0.4)",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(250,250,250,0.05)",
                      fontFamily: FONT,
                      fontSize: "14px",
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
                        borderBottom: idx < dates.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                        background: "transparent",
                        cursor: "pointer",
                        border: "none",
                        borderBottomWidth: idx < dates.length - 1 ? "1px" : "0",
                        borderBottomStyle: "solid",
                        borderBottomColor: "rgba(255,255,255,0.08)",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div className="flex items-center gap-3">
                        <span style={{ fontSize: "20px" }}>📅</span>
                        <span style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "20px" }}>
                          {formatDate(date)}
                        </span>
                      </div>
                      <span style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "20px" }}>
                        View →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Day leaderboard view ── */}
          {selectedDate && (
            <div className="w-full flex flex-col gap-5">
              {/* Back + date label */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-1.5 rounded-full transition-opacity hover:opacity-70"
                  style={{
                    background: "rgba(250,250,250,0.08)",
                    border: "1px solid rgba(255,255,255,0.2)",
                    color: "#FAFAFA",
                    fontFamily: FONT,
                    fontSize: "18px",
                    cursor: "pointer",
                  }}
                >
                  ← All dates
                </button>
                <span style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "18px" }}>
                  {formatDate(selectedDate)}
                </span>
              </div>

              {leaderboardLoading && (
                <p className="text-center animate-pulse" style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "20px" }}>
                  Loading leaderboard...
                </p>
              )}

              {leaderboardError && (
                <div style={{ ...panelStyle, padding: "16px", textAlign: "center" }}>
                  <p style={{ color: "#f87171", fontFamily: FONT, fontSize: "18px" }} role="alert">{leaderboardError}</p>
                </div>
              )}

              {!leaderboardLoading && !leaderboardError && leaderboard && leaderboard.entries.length === 0 && (
                <div style={{ ...panelStyle, padding: "40px", textAlign: "center" }}>
                  <p className="text-3xl mb-3">🌊</p>
                  <p style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "20px" }}>
                    No completed submissions for this day.
                  </p>
                </div>
              )}

              {!leaderboardLoading && !leaderboardError && leaderboard && leaderboard.entries.length > 0 && (
                <div style={panelStyle}>
                  {/* Table header */}
                  <div
                    className="grid grid-cols-12 px-5 py-3 uppercase tracking-widest"
                    style={{
                      color: "rgba(250,250,250,0.4)",
                      borderBottom: "1px solid rgba(255,255,255,0.1)",
                      background: "rgba(250,250,250,0.05)",
                      fontFamily: FONT,
                      fontSize: "14px",
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
                          borderBottom: idx < leaderboard.entries.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
                          background: isTop3 ? "rgba(255,255,255,0.04)" : "transparent",
                        }}
                      >
                        <span className="col-span-1 text-xl">
                          {MEDAL[entry.rank] ?? (
                            <span style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "20px" }}>
                              {entry.rank}
                            </span>
                          )}
                        </span>

                        <span
                          className="col-span-7 truncate"
                          style={{ color: isTop3 ? "#FAFAFA" : "rgba(250,250,250,0.7)", fontFamily: FONT, fontSize: "20px" }}
                        >
                          {entry.user_name}
                        </span>

                        <span
                          className="col-span-2 text-right"
                          style={{
                            fontFamily: FONT,
                            fontSize: "20px",
                            color: entry.score >= 80 ? "#22c55e" : entry.score >= 60 ? "#fbbf24" : "#f87171",
                          }}
                        >
                          {entry.score}/100
                        </span>

                        <span
                          className="col-span-2 text-right"
                          style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "16px" }}
                        >
                          {completedTime}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <p style={{ color: "rgba(250,250,250,0.25)", fontFamily: FONT, fontSize: "16px" }}>
            For educational use only · Not a diagnostic tool
          </p>
        </div>
      </section>
    </main>
  );
}
