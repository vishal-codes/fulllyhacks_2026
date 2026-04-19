"use client";

import Link from "next/link";
import { useState } from "react";
import { EndSessionResponse } from "@/types/scenario";

const FONT = "'Gochi Hand', cursive";

const PANEL: React.CSSProperties = {
  borderRadius: "24px",
  border: "2px solid rgba(255,255,255,1)",
  boxShadow: "0px 4px 10px 0px rgba(0,60,117,0.25)",
  background: "rgba(9,9,11,0.55)",
  backdropFilter: "blur(100px)",
  WebkitBackdropFilter: "blur(100px)",
  padding: "24px",
};

const INNER: React.CSSProperties = {
  borderRadius: "12px",
  background: "rgba(250,250,250,0.06)",
  border: "1px solid rgba(255,255,255,0.12)",
  padding: "16px",
};

type DomainReport = {
  score?: number;
  max?: number;
  feedback?: string;
  inferred_diagnosis?: string;
  correct_diagnosis?: string;
  is_correct?: boolean;
  what_was_done_well?: string[];
  what_was_missed?: string[];
};

type OsceReport = {
  total_score?: number;
  max_score?: number;
  examiner_note?: string;
  what_student_did_well?: string[];
  what_student_missed?: string[];
  domains?: Record<string, DomainReport>;
};

type CounterfactualReport = {
  missed_questions?: Array<{
    question?: string;
    why_important?: string;
    symptom_targeted?: string;
  }>;
  ideal_question_order?: string[];
  key_learning_point?: string;
};

const DOMAIN_LABELS: Record<string, string> = {
  history_taking: "History Taking",
  clinical_reasoning: "Clinical Reasoning",
  communication: "Communication",
  final_diagnosis: "Final Diagnosis",
};

export default function ReportPage() {
  const [report] = useState<EndSessionResponse | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem("last_osce_report");
      if (raw) return JSON.parse(raw) as EndSessionResponse;
    } catch { return null; }
    return null;
  });

  const osce = (report?.osce_report ?? {}) as OsceReport;
  const counterfactual = (report?.counterfactual ?? {}) as CounterfactualReport;
  const domains = osce.domains ?? {};

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
          Consultation Report
        </span>
        <div className="flex gap-3">
          <Link
            href="/"
            className="px-4 py-1.5 rounded-full transition-opacity hover:opacity-70"
            style={{
              background: "rgba(250,250,250,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: "#FAFAFA",
              fontFamily: FONT,
              fontSize: "18px",
            }}
          >
            Home
          </Link>
          <Link
            href="/setup"
            className="px-4 py-1.5 rounded-full transition-opacity hover:opacity-70"
            style={{
              background: "rgba(0,166,255,0.9)",
              border: "2px solid #00A6FF",
              color: "#FAFAFA",
              fontFamily: FONT,
              fontSize: "18px",
            }}
          >
            New Scenario ➤
          </Link>
        </div>
      </nav>

      {/* ── Scrollable content ── */}
      <section
        className="relative z-10 flex-1 w-full overflow-y-auto"
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.2) transparent" }}
      >
        <div className="mx-auto max-w-6xl px-6 pt-10 pb-12 flex flex-col gap-6">

          {/* Page header */}
          <div>
            <h1 className="text-5xl font-bold" style={{ color: "#FAFAFA", fontFamily: FONT, textShadow: "0px 4px 20px rgba(0,60,117,0.6)" }}>
              OSCE + Counterfactual Review
            </h1>
          </div>

          {/* No report state */}
          {!report && (
            <div style={{ ...PANEL, textAlign: "center" }}>
              <p style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "22px" }}>No report found yet.</p>
              <p className="mt-2" style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "18px" }}>
                Finish a consultation first, then the full report will appear here.
              </p>
            </div>
          )}

          {report && (
            <>
              {/* Patient + score summary */}
              <section style={PANEL}>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "18px" }}>Patient</p>
                    <h2 style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "28px" }}>
                      {report.patient.name}, {report.patient.age}-year-old {report.patient.gender.toLowerCase()}
                    </h2>
                    <p className="mt-1" style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "18px" }}>
                      Actual disease: {report.patient.disease}
                    </p>
                  </div>
                  <div
                    style={{
                      ...INNER,
                      padding: "20px 32px",
                      textAlign: "center",
                      background: "rgba(0,166,255,0.15)",
                      border: "2px solid rgba(0,166,255,0.4)",
                    }}
                  >
                    <p style={{ color: "rgba(250,250,250,0.5)", fontFamily: FONT, fontSize: "18px" }}>Total Score</p>
                    <p style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "48px", lineHeight: 1 }}>
                      {osce.total_score ?? 0}/{osce.max_score ?? 100}
                    </p>
                  </div>
                </div>
              </section>

              {/* OSCE + Counterfactual columns */}
              <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* OSCE Report */}
                <div style={PANEL}>
                  <h2 style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "28px", marginBottom: "16px" }}>
                    OSCE Report
                  </h2>
                  <div className="flex flex-col gap-4">
                    {Object.entries(domains).map(([key, domain]) => (
                      <div key={key} style={INNER}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <h3 style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "22px" }}>
                            {DOMAIN_LABELS[key] ?? key}
                          </h3>
                          <span style={{ color: "#00A6FF", fontFamily: FONT, fontSize: "22px" }}>
                            {domain.score ?? 0}/{domain.max ?? 25}
                          </span>
                        </div>
                        {domain.feedback && (
                          <p className="mb-3" style={{ color: "rgba(250,250,250,0.6)", fontFamily: FONT, fontSize: "18px" }}>
                            {domain.feedback}
                          </p>
                        )}
                        {key === "final_diagnosis" && (
                          <p className="mb-3" style={{ color: "rgba(250,250,250,0.7)", fontFamily: FONT, fontSize: "18px" }}>
                            Inferred: {domain.inferred_diagnosis ?? "Not stated"} | Correct: {domain.correct_diagnosis ?? "Unknown"}
                          </p>
                        )}
                        {!!domain.what_was_done_well?.length && (
                          <div className="mb-3">
                            <p className="uppercase tracking-wide mb-2" style={{ color: "#22c55e", fontFamily: FONT, fontSize: "14px" }}>Done Well</p>
                            <ul className="list-disc pl-5" style={{ color: "#d1fae5", fontFamily: FONT, fontSize: "18px" }}>
                              {domain.what_was_done_well.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                        {!!domain.what_was_missed?.length && (
                          <div>
                            <p className="uppercase tracking-wide mb-2" style={{ color: "#fbbf24", fontFamily: FONT, fontSize: "14px" }}>Missed</p>
                            <ul className="list-disc pl-5" style={{ color: "#fde68a", fontFamily: FONT, fontSize: "18px" }}>
                              {domain.what_was_missed.map((item, idx) => <li key={idx}>{item}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {osce.examiner_note && (
                    <div style={{ ...INNER, marginTop: "16px" }}>
                      <p className="uppercase tracking-wide mb-2" style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "14px" }}>Examiner Note</p>
                      <p style={{ color: "rgba(250,250,250,0.7)", fontFamily: FONT, fontSize: "18px" }}>{osce.examiner_note}</p>
                    </div>
                  )}
                </div>

                {/* Counterfactual Report */}
                <div style={PANEL}>
                  <h2 style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "28px", marginBottom: "16px" }}>
                    Counterfactual Report
                  </h2>

                  {!!counterfactual.missed_questions?.length && (
                    <div className="flex flex-col gap-4">
                      {counterfactual.missed_questions.map((item, idx) => (
                        <div key={idx} style={INNER}>
                          <p className="mb-2" style={{ color: "#FAFAFA", fontFamily: FONT, fontSize: "20px" }}>
                            {idx + 1}. {item.question}
                          </p>
                          {item.symptom_targeted && (
                            <p className="mb-2" style={{ color: "#00A6FF", fontFamily: FONT, fontSize: "16px" }}>
                              Targets: {item.symptom_targeted}
                            </p>
                          )}
                          {item.why_important && (
                            <p style={{ color: "rgba(250,250,250,0.6)", fontFamily: FONT, fontSize: "18px" }}>
                              {item.why_important}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {!!counterfactual.ideal_question_order?.length && (
                    <div style={{ ...INNER, marginTop: "16px" }}>
                      <p className="uppercase tracking-wide mb-3" style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "14px" }}>Ideal Question Order</p>
                      <ol className="list-decimal pl-5" style={{ color: "rgba(250,250,250,0.7)", fontFamily: FONT, fontSize: "18px" }}>
                        {counterfactual.ideal_question_order.map((item, idx) => (
                          <li key={idx} className="mb-1">{item}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {counterfactual.key_learning_point && (
                    <div style={{ ...INNER, marginTop: "16px" }}>
                      <p className="uppercase tracking-wide mb-2" style={{ color: "rgba(250,250,250,0.4)", fontFamily: FONT, fontSize: "14px" }}>Key Learning Point</p>
                      <p style={{ color: "rgba(250,250,250,0.6)", fontFamily: FONT, fontSize: "18px" }}>
                        {counterfactual.key_learning_point}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Footer */}
              <p className="text-center" style={{ color: "rgba(250,250,250,0.25)", fontFamily: FONT, fontSize: "16px" }}>
                For educational use only · Not a diagnostic tool
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
