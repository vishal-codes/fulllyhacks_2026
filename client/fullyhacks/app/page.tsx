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
      className="relative flex flex-col"
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
      {/* ── Gradient overlay: transparent at top → 90% dark at bottom ── */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,60,117,1) 100%)" }} />

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
        <span style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive", fontSize: "20px" }}>
          ClinicVerse
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button
            type="submit"
            className="px-4 py-1.5 rounded-full transition-opacity hover:opacity-70"
            style={{
              background: "rgba(250,250,250,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#FAFAFA",
              fontFamily: "'Gochi Hand', cursive",
              fontSize: "18px",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      </nav>

      {/* ── Hero ── */}
      <section className="relative z-10 flex-1 w-full overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}>
        <div className="flex flex-col items-center text-center px-6 pt-16 pb-12 gap-8 w-full max-w-4xl mx-auto">

        {/* Headline */}
        <div className="fade-up-2 flex flex-col gap-4">
          <h1
            className="text-6xl font-bold leading-tight"
            style={{
              color: "#FAFAFA",
              fontFamily: "'Gochi Hand', cursive",
              textShadow: "0px 4px 20px rgba(0,60,117,0.6)",
            }}
          >
            ClinicVerse
          </h1>
          <p
            className="text-xl leading-relaxed max-w-md mx-auto"
            style={{ color: "rgba(250,250,250,0.6)", fontFamily: "'Gochi Hand', cursive" }}
          >
            An educational simulation platform where medical students practice
            diagnostic conversations with realistic virtual patients.
          </p>
          <p style={{ color: "rgba(250,250,250,0.4)", fontFamily: "'Gochi Hand', cursive", fontSize: "18px" }}>
            Signed in as {displayName}
          </p>
        </div>

        {/* Entry point cards */}
        <div className="fade-up-3 w-full pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">

            {/* Teacher mode card */}
            <div
              className="flex flex-col justify-between gap-5 p-8"
              style={{
                borderRadius: "24px",
                border: "2px solid rgba(255,255,255,1)",
                boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
                background: "rgba(9,9,11,0.55)",
                backdropFilter: "blur(100px)",
                WebkitBackdropFilter: "blur(100px)",
              }}
            >
              <div>
                <p
                  className="uppercase tracking-widest"
                  style={{ color: "rgba(250,250,250,0.4)", fontFamily: "'Gochi Hand', cursive", fontSize: "14px" }}
                >
                  Teacher Mode
                </p>
                <h2
                  className="text-3xl font-semibold mt-3"
                  style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive" }}
                >
                  Build a Custom Case
                </h2>
                <p
                  className="text-lg mt-3 max-w-sm"
                  style={{ color: "rgba(250,250,250,0.6)", fontFamily: "'Gochi Hand', cursive" }}
                >
                  Open the teacher portal to choose a disease, adjust symptoms, tune vitals,
                  and start a guided practice scenario.
                </p>
              </div>

              <Link
                href="/setup"
                className="flex items-center justify-between transition-opacity hover:opacity-90 w-full"
                style={{
                  background: "rgba(0,166,255,0.9)",
                  border: "2px solid #00A6FF",
                  borderRadius: "12px",
                  padding: "12px 16px 12px 20px",
                  textDecoration: "none",
                }}
              >
                <span style={{ color: "#FAFAFA", fontSize: "22px", fontFamily: "'Gochi Hand', cursive" }}>
                  Enter Teacher Portal
                </span>
                <span style={{ color: "#FAFAFA", fontSize: "24px", fontWeight: "bold" }}>➤</span>
              </Link>
            </div>

            {/* Competition panel — keeps its own styling */}
            <CompetitionPanel />
          </div>
        </div>

        {/* Shimmer divider */}
        <div className="fade-up-4 shimmer-line w-48" />

        {/* Leaderboard entry */}
        <div className="fade-up-4 w-full">
          <Link
            href="/leaderboard"
            className="flex items-center justify-between w-full px-7 py-5 transition-all duration-200"
            style={{
              borderRadius: "24px",
              border: "2px solid rgba(255,255,255,1)",
              boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
              background: "rgba(9,9,11,0.55)",
              backdropFilter: "blur(100px)",
              WebkitBackdropFilter: "blur(100px)",
              textDecoration: "none",
            }}
          >
            <div className="text-left">
              <p style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive", fontSize: "22px" }}>
                View Competition Leaderboards
              </p>
              <p style={{ color: "rgba(250,250,250,0.4)", fontFamily: "'Gochi Hand', cursive", fontSize: "16px", marginTop: "2px" }}>
                Browse previous daily competitions and see how everyone ranked.
              </p>
            </div>
            <span style={{ color: "#FAFAFA", fontFamily: "'Gochi Hand', cursive", fontSize: "22px" }}>
              View all →
            </span>
          </Link>
        </div>
        </div>

        {/* ── Footer ── */}
        <footer
          className="relative z-10 w-full text-center py-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          <p style={{ color: "rgba(250,250,250,0.25)", fontFamily: "'Gochi Hand', cursive", fontSize: "16px" }}>
            For educational use only · Not a diagnostic tool
          </p>
        </footer>
      </section>
    </main>
  );
}
