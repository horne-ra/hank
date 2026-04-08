"use client";

import { useTranscriptHistory } from "../hooks/useTranscriptHistory";

export function Transcript() {
  const lines = useTranscriptHistory();

  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <p className="text-sm text-neutral-500 text-center">
          Your conversation with Hank will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 min-h-0 overflow-y-auto scrollbar-hide px-4 py-2">
      {lines.map((line) =>
        line.role === "hank" ? (
          <div key={line.id} className="mb-4">
            <div className="flex justify-between items-baseline mb-1 px-0.5">
              <span className="text-[9px] uppercase tracking-tighter text-neutral-500">
                HANK
              </span>
              <span className="text-[9px] font-mono text-neutral-600 tabular-nums">
                {line.displayTime}
              </span>
            </div>
            <div className="bg-[#171717] border-l-2 border-amber-500 p-3 text-neutral-200 text-sm leading-relaxed">
              {line.text}
            </div>
          </div>
        ) : (
          <div key={line.id} className="mb-4">
            <div className="flex justify-between items-baseline mb-1 px-0.5">
              <span className="text-[9px] uppercase tracking-tighter text-neutral-500">
                YOU
              </span>
              <span className="text-[9px] font-mono text-neutral-600 tabular-nums">
                {line.displayTime}
              </span>
            </div>
            <p className="text-neutral-400 pl-0.5 text-sm leading-relaxed">{line.text}</p>
          </div>
        )
      )}
    </div>
  );
}
