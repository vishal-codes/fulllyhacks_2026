"use client";

import Link from "next/link";
import { useState } from "react";
import { EndSessionResponse } from "@/types/scenario";

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
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const raw = sessionStorage.getItem("last_osce_report");
      if (raw) {
        return JSON.parse(raw) as EndSessionResponse;
      }
    } catch {
      return null;
    }
    return null;
  });

  const osce = (report?.osce_report ?? {}) as OsceReport;
  const counterfactual = (report?.counterfactual ?? {}) as CounterfactualReport;
  const domains = osce.domains ?? {};

  return (
    <main
      className="min-h-screen px-4 py-10"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, #0d3b6e 0%, #0e2a4a 45%, #081423 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm" style={{ color: "#7dd3e8" }}>
              Consultation Report
            </p>
            <h1 className="text-4xl font-bold" style={{ color: "#22d3ee" }}>
              OSCE + Counterfactual Review
            </h1>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#bae6fd",
              }}
            >
              Home
            </Link>
            <Link
              href="/setup"
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{
                background: "rgba(34,211,238,0.14)",
                border: "1px solid rgba(34,211,238,0.2)",
                color: "#e0f4f8",
              }}
            >
              New Scenario
            </Link>
          </div>
        </div>

        {!report && (
          <div
            className="rounded-3xl p-8 text-center"
            style={{
              background: "rgba(13,59,110,0.35)",
              border: "1px solid rgba(34,211,238,0.16)",
            }}
          >
            <p style={{ color: "#bae6fd" }}>No report found yet.</p>
            <p className="mt-2 text-sm" style={{ color: "#7dd3e8" }}>
              Finish a consultation first, then the full report will appear here.
            </p>
          </div>
        )}

        {report && (
          <div className="flex flex-col gap-6">
            <section
              className="rounded-3xl p-6"
              style={{
                background: "rgba(13,59,110,0.35)",
                border: "1px solid rgba(34,211,238,0.16)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm" style={{ color: "#7dd3e8" }}>
                    Patient
                  </p>
                  <h2 className="text-2xl font-semibold" style={{ color: "#e0f4f8" }}>
                    {report.patient.name}, {report.patient.age}-year-old {report.patient.gender.toLowerCase()}
                  </h2>
                  <p className="mt-2 text-sm" style={{ color: "#4a8fa8" }}>
                    Actual disease: {report.patient.disease}
                  </p>
                </div>
                <div
                  className="rounded-2xl px-6 py-4 text-center"
                  style={{
                    background: "linear-gradient(135deg, rgba(34,211,238,0.24), rgba(59,130,246,0.18))",
                    border: "1px solid rgba(34,211,238,0.22)",
                  }}
                >
                  <p className="text-sm" style={{ color: "#7dd3e8" }}>
                    Total Score
                  </p>
                  <p className="text-4xl font-bold" style={{ color: "#ffffff" }}>
                    {osce.total_score ?? 0}/{osce.max_score ?? 100}
                  </p>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div
                className="rounded-3xl p-6"
                style={{
                  background: "rgba(13,59,110,0.35)",
                  border: "1px solid rgba(34,211,238,0.16)",
                }}
              >
                <h2 className="text-2xl font-semibold mb-4" style={{ color: "#bae6fd" }}>
                  OSCE Report
                </h2>
                <div className="flex flex-col gap-4">
                  {Object.entries(domains).map(([key, domain]) => (
                    <div
                      key={key}
                      className="rounded-2xl p-4"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-lg font-semibold" style={{ color: "#e0f4f8" }}>
                          {DOMAIN_LABELS[key] ?? key}
                        </h3>
                        <span className="text-sm font-semibold" style={{ color: "#22d3ee" }}>
                          {domain.score ?? 0}/{domain.max ?? 25}
                        </span>
                      </div>
                      {domain.feedback && (
                        <p className="text-sm mb-3" style={{ color: "#7dd3e8" }}>
                          {domain.feedback}
                        </p>
                      )}
                      {key === "final_diagnosis" && (
                        <p className="text-sm mb-3" style={{ color: "#bae6fd" }}>
                          Inferred: {domain.inferred_diagnosis ?? "Not stated"} | Correct: {domain.correct_diagnosis ?? "Unknown"}
                        </p>
                      )}
                      {!!domain.what_was_done_well?.length && (
                        <div className="mb-3">
                          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#22c55e" }}>
                            Done Well
                          </p>
                          <ul className="list-disc pl-5 text-sm" style={{ color: "#d1fae5" }}>
                            {domain.what_was_done_well.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!!domain.what_was_missed?.length && (
                        <div>
                          <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#fbbf24" }}>
                            Missed
                          </p>
                          <ul className="list-disc pl-5 text-sm" style={{ color: "#fde68a" }}>
                            {domain.what_was_missed.map((item, idx) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {osce.examiner_note && (
                  <div
                    className="rounded-2xl p-4 mt-5"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#4a8fa8" }}>
                      Examiner Note
                    </p>
                    <p className="text-sm" style={{ color: "#bae6fd" }}>
                      {osce.examiner_note}
                    </p>
                  </div>
                )}
              </div>

              <div
                className="rounded-3xl p-6"
                style={{
                  background: "rgba(13,59,110,0.35)",
                  border: "1px solid rgba(34,211,238,0.16)",
                }}
              >
                <h2 className="text-2xl font-semibold mb-4" style={{ color: "#bae6fd" }}>
                  Counterfactual Report
                </h2>

                {!!counterfactual.missed_questions?.length && (
                  <div className="flex flex-col gap-4">
                    {counterfactual.missed_questions.map((item, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl p-4"
                        style={{
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        <p className="text-sm font-semibold mb-2" style={{ color: "#e0f4f8" }}>
                          {idx + 1}. {item.question}
                        </p>
                        {item.symptom_targeted && (
                          <p className="text-xs mb-2" style={{ color: "#22d3ee" }}>
                            Targets: {item.symptom_targeted}
                          </p>
                        )}
                        {item.why_important && (
                          <p className="text-sm" style={{ color: "#7dd3e8" }}>
                            {item.why_important}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!!counterfactual.ideal_question_order?.length && (
                  <div
                    className="rounded-2xl p-4 mt-5"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <p className="text-xs uppercase tracking-wide mb-3" style={{ color: "#4a8fa8" }}>
                      Ideal Question Order
                    </p>
                    <ol className="list-decimal pl-5 text-sm" style={{ color: "#bae6fd" }}>
                      {counterfactual.ideal_question_order.map((item, idx) => (
                        <li key={idx} className="mb-1">{item}</li>
                      ))}
                    </ol>
                  </div>
                )}

                {counterfactual.key_learning_point && (
                  <div
                    className="rounded-2xl p-4 mt-5"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "#4a8fa8" }}>
                      Key Learning Point
                    </p>
                    <p className="text-sm" style={{ color: "#7dd3e8" }}>
                      {counterfactual.key_learning_point}
                    </p>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
