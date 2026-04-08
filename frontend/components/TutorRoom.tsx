"use client";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { SessionView } from "./SessionView";

type Props = {
  token: string;
  serverUrl: string;
  initialMessage?: string;
  onEnd: () => void;
  onUnexpectedDisconnect?: (message: string) => void;
};

export function TutorRoom({
  token,
  serverUrl,
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
        if (
          err.message?.toLowerCase().includes("permission") ||
          err.name === "NotAllowedError"
        ) {
          onUnexpectedDisconnect?.(
            "Hank needs access to your microphone to hear you. Please allow mic access in your browser settings and try again."
          );
        } else {
          onUnexpectedDisconnect?.(`Connection error: ${err.message}`);
        }
      }}
      className="h-dvh flex flex-col"
    >
      <SessionView
        initialMessage={initialMessage}
        onUnexpectedDisconnect={onUnexpectedDisconnect}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
