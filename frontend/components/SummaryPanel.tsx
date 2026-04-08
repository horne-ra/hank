"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { HankLogo } from "./HankLogo";
import { SummarySection } from "./SummarySection";

type Summary = {
  topics_covered: string[];
  key_steps_taught: string[];
  things_user_struggled_with: string[];
  suggested_next_lessons: string[];
  _error?: string;
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

type Props = {
  sessionId: number;
  onNewSession: (initialMessage?: string) => void;
};

export function SummaryPanel({ sessionId, onNewSession }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    // Wait up to ~45s — the worker's shutdown sequence (session report upload + summary generation) can take 20-30s before the row is finalized in SQLite.
    const maxAttempts = 45;

    async function poll() {
      if (cancelled) return;
      attempts++;

      try {
        const res = await fetch(
          `${BACKEND_URL}/sessions/${sessionId}/summary`
        );

        if (res.ok) {
          const data = (await res.json()) as Summary;
          if (!cancelled) setSummary(data);
          return;
        }

        if (res.status === 404 && attempts < maxAttempts) {
          setTimeout(poll, 1000);
          return;
        }

        if (!cancelled) {
          setError(`Couldn't load summary (status ${res.status})`);
        }
      } catch {
        if (attempts < maxAttempts) {
          setTimeout(poll, 1000);
          return;
        }
        if (!cancelled) {
          setError("Couldn't reach the backend to load your summary.");
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
        <p className="text-red-500 mb-6 text-center max-w-sm">{error}</p>
        <button
          onClick={() => onNewSession()}
          className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg"
        >
          Back to home
        </button>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-4" />
        <p className="text-neutral-500 text-sm">
          {"Hank's writing up his notes..."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-dvh flex flex-col p-6 max-w-2xl mx-auto bg-[#0a0a0a]">
      <header className="mb-8 pt-6">
        <div className="mb-4">
          <HankLogo />
        </div>
        <p className="text-[10px] uppercase tracking-widest text-amber-500 mb-2 font-bold">
          {"Hank's Notes"}
        </p>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          Session Summary
        </h1>
      </header>

      <SummarySection title="What we covered" items={summary.topics_covered} />
      <SummarySection title="Steps walked through" items={summary.key_steps_taught} />

      {summary.things_user_struggled_with.length > 0 && (
        <SummarySection
          title="Where you got stuck"
          items={summary.things_user_struggled_with}
        />
      )}

      {summary.suggested_next_lessons.length > 0 && (
        <section className="mb-8">
          <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 mb-3 font-bold">
            {"Next time, let's tackle"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {summary.suggested_next_lessons.map((lesson) => (
              <button
                key={lesson}
                onClick={() => onNewSession(lesson)}
                className="text-left p-4 bg-[#171717] border border-[#262626] rounded-lg text-sm text-neutral-300 hover:border-amber-500 transition-colors"
              >
                {lesson}
              </button>
            ))}
          </div>
        </section>
      )}

      <button
        onClick={() => onNewSession()}
        className="mt-auto w-full bg-amber-500 text-[#0a0a0a] font-bold py-4 rounded-lg shadow-[0_10px_30px_rgba(245,158,11,0.2)] active:scale-[0.98] transition-transform"
      >
        Start a new session
      </button>
    </main>
  );
}
