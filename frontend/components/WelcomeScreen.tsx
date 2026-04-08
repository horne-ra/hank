"use client";

import { motion } from "framer-motion";
import {
  Wrench,
  Droplets,
  Zap,
  Paintbrush,
} from "lucide-react";
import { HankLogo } from "./HankLogo";

const SUGGESTIONS = [
  { id: "1", text: "My toilet keeps running", icon: <Droplets className="w-4 h-4" /> },
  { id: "2", text: "A breaker won't reset", icon: <Zap className="w-4 h-4" /> },
  { id: "3", text: "How do I patch drywall?", icon: <Wrench className="w-4 h-4" /> },
  { id: "4", text: "Painting a room evenly", icon: <Paintbrush className="w-4 h-4" /> },
];

type Props = {
  onStart: (initialMessage?: string) => void;
  isConnecting: boolean;
  error: string | null;
};

export function WelcomeScreen({ onStart, isConnecting, error }: Props) {
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
      </main>
    </motion.div>
  );
}
