"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, ArrowLeft } from "lucide-react";
import { HankLogo } from "./HankLogo";
import { SummarySection } from "./SummarySection";

type Summary = {
  session_title?: string;
  topics_covered: string[];
  key_steps_taught: string[];
  things_user_struggled_with: string[];
  suggested_next_lessons: string[];
  _error?: string;
};

type Detail = {
  id: number;
  started_at: string | null;
  ended_at: string | null;
  summary: Summary | null;
  summary_ready: boolean;
  resume_from_session_id: number | null;
};

type Props = {
  sessionId: number;
  onBack: () => void;
  onResume: (sessionId: number) => void;
  onNewSessionFromTopic: (topic: string) => void;
};

function normalizeSummary(raw: Summary | null): Summary | null {
  if (!raw) return null;
  const toArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    session_title:
      typeof raw.session_title === "string" ? raw.session_title : undefined,
    topics_covered: toArray(raw.topics_covered),
    key_steps_taught: toArray(raw.key_steps_taught),
    things_user_struggled_with: toArray(raw.things_user_struggled_with),
    suggested_next_lessons: toArray(raw.suggested_next_lessons),
    _error: typeof raw._error === "string" ? raw._error : undefined,
  };
}

export function SessionDetail({
  sessionId,
  onBack,
  onResume,
  onNewSessionFromTopic,
}: Props) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function clearPoll() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    async function fetchDetail() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) {
          clearPoll();
          if (!cancelled) setError(`Couldn't load session (status ${res.status})`);
          return;
        }
        const data: Detail = await res.json();
        const normalized = {
          ...data,
          summary: normalizeSummary(data.summary),
        };
        if (!cancelled) {
          setError(null);
          setDetail(normalized);
          if (normalized.summary_ready) {
            clearPoll();
          }
        }
      } catch (err) {
        clearPoll();
        if (!cancelled) setError(String(err));
      }
    }

    void fetchDetail();
    intervalRef.current = setInterval(fetchDetail, 3000);

    return () => {
      cancelled = true;
      clearPoll();
    };
  }, [sessionId]);

  if (error && !detail) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
        <p className="text-red-500 mb-4 text-center max-w-sm">{error}</p>
        <button
          onClick={onBack}
          className="px-6 py-3 bg-[#171717] border border-[#262626] text-neutral-300 rounded-lg"
        >
          Back to home
        </button>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </main>
    );
  }

  if (detail.summary_ready && detail.summary?._error) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center p-6 bg-[#0a0a0a]">
        <p className="text-red-500 mb-4 text-center max-w-sm">{detail.summary._error}</p>
        <button
          onClick={onBack}
          className="px-6 py-3 bg-[#171717] border border-[#262626] text-neutral-300 rounded-lg"
        >
          Back to home
        </button>
      </main>
    );
  }

  if (!detail.summary_ready || !detail.summary) {
    return (
      <main className="min-h-dvh flex flex-col p-6 max-w-2xl mx-auto bg-[#0a0a0a]">
        <header className="mb-8 pt-6">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-neutral-500 hover:text-neutral-300 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs uppercase tracking-wider">Back</span>
          </button>
          <div className="mb-4">
            <HankLogo />
          </div>
          <p className="text-[10px] uppercase tracking-widest text-amber-500 mb-2 font-bold">
            Hank&apos;s Notes
          </p>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mb-4" />
          <p className="text-neutral-300 text-center mb-2">
            Hank&apos;s still writing up his notes from this conversation.
          </p>
          <p className="text-neutral-500 text-sm text-center max-w-sm">
            This usually takes 20-30 seconds. The page will update automatically.
          </p>
        </div>

        <button
          onClick={onBack}
          className="mt-auto w-full bg-[#171717] border border-[#262626] text-neutral-300 font-medium py-4 rounded-lg hover:border-neutral-700 transition-colors"
        >
          Back to home
        </button>
      </main>
    );
  }

  const summary = detail.summary;

  return (
    <main className="min-h-dvh flex flex-col p-6 max-w-2xl mx-auto bg-[#0a0a0a]">
      <header className="mb-8 pt-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-neutral-500 hover:text-neutral-300 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs uppercase tracking-wider">Back</span>
        </button>
        <div className="mb-4">
          <HankLogo />
        </div>
        <p className="text-[10px] uppercase tracking-widest text-amber-500 mb-2 font-bold">
          Hank&apos;s Notes
        </p>
        <h1 className="text-3xl font-bold text-white tracking-tight">
          {summary.session_title ?? "Session Summary"}
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
            Next time, let&apos;s tackle
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {summary.suggested_next_lessons.map((lesson, idx) => (
              <button
                key={`${lesson}-${idx}`}
                onClick={() => onNewSessionFromTopic(lesson)}
                className="text-left p-4 bg-[#171717] border border-[#262626] rounded-lg text-sm text-neutral-300 hover:border-amber-500 transition-colors"
              >
                {lesson}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="mt-auto space-y-3">
        <button
          onClick={() => onResume(detail.id)}
          className="w-full bg-amber-500 text-[#0a0a0a] font-bold py-4 rounded-lg shadow-[0_10px_30px_rgba(245,158,11,0.2)] active:scale-[0.98] transition-transform"
        >
          Continue this session
        </button>
        <button
          onClick={onBack}
          className="w-full bg-[#171717] border border-[#262626] text-neutral-300 font-medium py-4 rounded-lg hover:border-neutral-700 transition-colors"
        >
          Back to home
        </button>
      </div>
    </main>
  );
}
