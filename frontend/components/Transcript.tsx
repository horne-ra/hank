"use client";

import { useMemo } from "react";
import { Track } from "livekit-client";
import {
  useLocalParticipant,
  useTrackTranscription,
  useVoiceAssistant,
} from "@livekit/components-react";

type TranscriptLine = {
  id: string;
  role: "hank" | "you";
  text: string;
  sortTime: number;
  displayTime: string;
};

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function segmentKey(
  seg: { id?: string; receivedAt: number },
  prefix: string,
  index: number
): string {
  return `${prefix}-${seg.id ?? "seg"}-${index}-${seg.receivedAt}`;
}

export function Transcript() {
  const { agentTranscriptions } = useVoiceAssistant();
  const { localParticipant, microphoneTrack } = useLocalParticipant();

  const localMicRef =
    microphoneTrack !== undefined
      ? {
          participant: localParticipant,
          publication: microphoneTrack,
          source: Track.Source.Microphone,
        }
      : undefined;

  const { segments: userSegments } = useTrackTranscription(localMicRef);

  const lines = useMemo((): TranscriptLine[] => {
    const hank: TranscriptLine[] = agentTranscriptions.map((seg, index) => ({
      id: segmentKey(seg, "hank", index),
      role: "hank" as const,
      text: seg.text,
      sortTime: seg.receivedAt,
      displayTime: formatTime(seg.receivedAt),
    }));
    const you: TranscriptLine[] = userSegments.map((seg, index) => ({
      id: segmentKey(seg, "you", index),
      role: "you" as const,
      text: seg.text,
      sortTime: seg.receivedAt,
      displayTime: formatTime(seg.receivedAt),
    }));
    return [...hank, ...you].sort((a, b) => a.sortTime - b.sortTime);
  }, [agentTranscriptions, userSegments]);

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
