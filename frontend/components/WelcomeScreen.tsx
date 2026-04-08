"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Wrench,
  Droplets,
  Zap,
  Paintbrush,
  Clock,
  Loader2,
} from "lucide-react";
import { HankLogo } from "./HankLogo";

const SUGGESTIONS = [
  { id: "1", text: "My toilet keeps running", icon: <Droplets className="w-4 h-4" /> },
  { id: "2", text: "A breaker won't reset", icon: <Zap className="w-4 h-4" /> },
  { id: "3", text: "How do I patch drywall?", icon: <Wrench className="w-4 h-4" /> },
  { id: "4", text: "Painting a room evenly", icon: <Paintbrush className="w-4 h-4" /> },
];

type PastSession = {
  id: number;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  summary_ready: boolean;
};

type Props = {
  onStart: (initialMessage?: string) => void;
  onViewSession: (sessionId: number) => void;
  onResumeSession: (sessionId: number) => void;
  isConnecting: boolean;
  error: string | null;
};

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function WelcomeScreen({
  onStart,
  onViewSession,
  onResumeSession,
  isConnecting,
  error,
}: Props) {
  const [pastSessions, setPastSessions] = useState<PastSession[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      try {
        const res = await fetch("/api/sessions");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setPastSessions(data.slice(0, 5));
        }
      } catch {
        /* past sessions are optional */
      }
    }

    void fetchSessions();
    const interval = setInterval(fetchSessions, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col p-4 pt-6"
    >
      <header className="flex justify-center mb-16">
        <HankLogo centered />
      </header>

      <main className="flex-1 flex flex-col items-center">
        <h2 className="text-[32px] font-bold tracking-tight text-white mb-3 text-center">
          What&apos;s broken?
        </h2>
        <p className="text-neutral-500 text-sm text-center max-w-[280px] leading-relaxed mb-12">
          Hank&apos;s been fixing houses for forty years. Tell him what&apos;s going on.
        </p>

        <button
          type="button"
          disabled={isConnecting}
          aria-busy={isConnecting}
          onClick={() => onStart()}
          className="w-full bg-[#f59e0b] text-[#0a0a0a] font-bold py-4 px-8 rounded-lg flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(245,158,11,0.2)] active:scale-[0.98] transition-transform mb-8 disabled:opacity-70 disabled:active:scale-100"
        >
          <span className="text-xl">🎙</span>
          <span className="tracking-tight">
            {isConnecting ? "Connecting..." : "Start talking to Hank"}
          </span>
        </button>

        {error ? (
          <p className="text-red-400 text-sm text-center max-w-[280px] mb-4" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-4 w-full mb-8">
          <div className="h-[1px] flex-1 bg-[#262626]" />
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#737373] font-bold whitespace-nowrap">
            or pick something common
          </span>
          <div className="h-[1px] flex-1 bg-[#262626]" />
        </div>

        <div className="grid grid-cols-2 gap-3 w-full">
          {SUGGESTIONS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              disabled={isConnecting}
              onClick={() => onStart(chip.text)}
              className="flex flex-col items-start gap-3 p-4 bg-[#171717] border border-[#262626] rounded-lg text-left active:bg-[#262626] transition-colors disabled:opacity-50"
            >
              <div className="text-amber-500">{chip.icon}</div>
              <span className="text-[11px] font-medium text-neutral-300 leading-tight">
                {chip.text}
              </span>
            </button>
          ))}
        </div>

        {pastSessions.length > 0 && (
          <section className="w-full mt-12">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3 h-3 text-neutral-500" />
              <h3 className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-bold">
                Recent sessions
              </h3>
            </div>
            <div className="space-y-2">
              {pastSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 p-3 bg-[#171717] border border-[#262626] rounded-lg hover:border-amber-500/50 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onViewSession(session.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    {session.summary_ready && session.title ? (
                      <p className="text-sm text-neutral-200 truncate">{session.title}</p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin text-amber-500/70" />
                        <p className="text-sm text-neutral-500 italic">
                          Hank&apos;s writing notes...
                        </p>
                      </div>
                    )}
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {formatRelativeTime(session.started_at)}
                    </p>
                  </button>
                  {session.summary_ready && (
                    <button
                      type="button"
                      onClick={() => onResumeSession(session.id)}
                      className="flex-shrink-0 px-3 py-1.5 bg-amber-500/10 border border-amber-500/40 text-amber-500 text-[10px] uppercase tracking-wider font-bold rounded hover:bg-amber-500/20 transition-colors"
                    >
                      Continue
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </motion.div>
  );
}
