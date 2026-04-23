"use client";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { SessionView } from "./SessionView";

type Props = {
  token: string;
  serverUrl: string;
  sessionId: number;
  initialMessage?: string;
  onEnd: () => void;
  onUnexpectedDisconnect?: (message: string) => void;
};

export function TutorRoom({
  token,
  serverUrl,
  sessionId,
  initialMessage,
  onEnd,
  onUnexpectedDisconnect,
}: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio
      video={false}
      onDisconnected={onEnd}
      onError={(err) => {
        const micErrors = new Set([
          "NotAllowedError",
          "NotFoundError",
          "NotReadableError",
          "SecurityError",
        ]);
        const msg = err.message?.toLowerCase() ?? "";
        if (
          micErrors.has(err.name) ||
          msg.includes("permission") ||
          msg.includes("not found") ||
          msg.includes("no device")
        ) {
          onUnexpectedDisconnect?.(
            "Hank needs access to your microphone to hear you. Please allow mic access in your browser settings and try again."
          );
        } else {
          const detail = err.message || err.name || "Unknown error";
          onUnexpectedDisconnect?.(`Connection error: ${detail}`);
        }
      }}
      className="h-dvh flex flex-col"
    >
      <SessionView
        sessionId={sessionId}
        initialMessage={initialMessage}
        onUnexpectedDisconnect={onUnexpectedDisconnect}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
