import Link from "next/link";
import { auth, signOut } from "@/auth";
import CompetitionPanel from "@/components/CompetitionPanel";

/* Bubble config: [size-px, left-%, delay-s, duration-s] */
const BUBBLES: [number, number, number, number][] = [
  [10,  5,  0,   8],
  [18, 12,  3,  12],
  [8,  22,  1,   7],
  [24, 33,  5,  14],
  [14, 47,  2,  10],
  [20, 58,  7,  13],
  [10, 68,  0.5, 9],
  [28, 76,  4,  16],
  [12, 85,  6,  11],
  [8,  93,  2,   8],
];


export default async function WelcomePage() {
  const session = await auth();
  const displayName =
    session?.backendUser?.name ?? session?.user?.name ?? session?.user?.email ?? "Doctor";

  return (
    <main
      className="relative flex flex-col items-center min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% -10%, #0d3b6e 0%, #0a1e3d 35%, #060e1f 100%)",
      }}
    >
      {/* ── Bubbles ── */}
      {BUBBLES.map(([size, left, delay, duration], i) => (
        <span
          key={i}
          className="bubble"
          style={{
            width:  size,
            height: size,
            left:   `${left}%`,
            animationDelay:    `${delay}s`,
            animationDuration: `${duration}s`,
          }}
        />
      ))}

      {/* ── Ocean floor glow ── */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0"
        style={{
          height: "220px",
          background:
            "linear-gradient(to top, rgba(8,145,178,0.12) 0%, transparent 100%)",
        }}
      />

      {/* ── Top nav bar ── */}
      <nav
        className="relative z-10 w-full flex items-center justify-between px-8 py-5"
        style={{ borderBottom: "1px solid rgba(34,211,238,0.08)" }}
      >
       
        <span className="text-xs px-3 py-1 rounded-full" style={{
          background: "rgba(34,211,238,0.08)",
          border: "1px solid rgba(34,211,238,0.15)",
          color: "#4a8fa8",
        }}>
          Educational Tool
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="text-xs px-3 py-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#bae6fd",
            }}
          >
            Sign out
          </button>
        </form>
      </nav>

      {/* ── Hero ── */}
      <section
        className="relative z-10 flex flex-col items-center text-center px-6 pt-20 pb-16 gap-8 w-full max-w-3xl mx-auto"
      >
        {/* Glowing shell icon */}
        

        {/* Headline */}
        <div className="fade-up-2 flex flex-col gap-4">
          <h1
            className="text-6xl font-bold leading-tight tracking-tight"
            style={{
              color: "#22d3ee",
              textShadow: "0 0 60px rgba(34,211,238,0.25)",
            }}
          >
            Virtual Patient
            <br />
            Practice
          </h1>
          <p
            className="text-lg leading-relaxed max-w-md mx-auto"
            style={{ color: "#7dd3e8" }}
          >
            An educational simulation platform where medical students practice
            diagnostic conversations with realistic virtual patients.
          </p>
          <p className="text-sm" style={{ color: "#bae6fd" }}>
            Signed in as {displayName}
          </p>
        </div>

        {/* Entry points */}
        <div className="fade-up-3 w-full max-w-5xl pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div
              className="ocean-card rounded-3xl p-8 flex flex-col items-center text-center gap-5"
              style={{ minHeight: "100%" }}
            >
              <div>
                <p className="text-xs uppercase tracking-[0.3em]" style={{ color: "#4a8fa8" }}>
                  Teacher Mode
                </p>
                <h2 className="text-3xl font-semibold mt-3" style={{ color: "#bae6fd" }}>
                  Build a Custom Case
                </h2>
                <p className="text-sm mt-3 max-w-sm" style={{ color: "#7dd3e8" }}>
                  Open the teacher portal to choose a disease, adjust symptoms, tune vitals,
                  and start a guided practice scenario.
                </p>
              </div>

              <Link
                href="/setup"
                className="cta-btn inline-flex items-center gap-3 px-10 py-4 rounded-2xl font-semibold text-base"
              >
                Enter Teacher Portal
              </Link>
            </div>

            <CompetitionPanel />
          </div>
        </div>

        {/* Shimmer divider */}
        <div className="fade-up-4 shimmer-line w-48" />

        {/* Leaderboard entry */}
        <div className="fade-up-4 w-full max-w-5xl">
          <Link
            href="/leaderboard"
            className="flex items-center justify-between w-full px-7 py-5 rounded-2xl transition-all duration-200 group"
            style={{
              background: "rgba(13,59,110,0.35)",
              border: "1px solid rgba(34,211,238,0.15)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center gap-4">
              <div className="text-left">
                <p className="text-sm font-semibold" style={{ color: "#bae6fd" }}>
                  View Competition Leaderboards
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#4a8fa8" }}>
                  Browse previous daily competitions and see how everyone ranked.
                </p>
              </div>
            </div>
            <span
              className="text-sm font-medium transition-colors"
              style={{ color: "#22d3ee" }}
            >
              View all →
            </span>
          </Link>
        </div>
      </section>



      {/* ── Footer ── */}
      <footer
        className="relative z-10 w-full text-center py-6"
        style={{ borderTop: "1px solid rgba(34,211,238,0.07)" }}
      >
        <p className="text-xs" style={{ color: "#2a5f72" }}>
          For educational use only · Not a diagnostic tool
        </p>
      </footer>
    </main>
  );
}
