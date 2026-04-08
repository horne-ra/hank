"use client";

import { useEffect, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import {
  Participant,
  RoomEvent,
  TrackPublication,
  TranscriptionSegment,
} from "livekit-client";

export type TranscriptEntry = {
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

export function useTranscriptHistory(): TranscriptEntry[] {
  const room = useRoomContext();
  const [history, setHistory] = useState<TranscriptEntry[]>([]);

  useEffect(() => {
    if (!room) return;

    const handleTranscription = (
      segments: TranscriptionSegment[],
      participant?: Participant,
      _publication?: TrackPublication
    ) => {
      const finalSegments = segments.filter((s) => s.final);
      if (finalSegments.length === 0) return;

      const isAgent = participant?.isAgent ?? false;
      const newEntries: TranscriptEntry[] = finalSegments.map((s) => {
        const sortMs = s.startTime;
        return {
          id: s.id,
          role: isAgent ? ("hank" as const) : ("you" as const),
          text: s.text,
          sortTime: sortMs,
          displayTime: formatTime(sortMs),
        };
      });

      setHistory((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const filtered = newEntries.filter((e) => !existingIds.has(e.id));
        if (filtered.length === 0) return prev;
        const merged = [...prev, ...filtered];
        merged.sort((a, b) => a.sortTime - b.sortTime);
        return merged;
      });
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscription);
    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [room]);

  return history;
}
