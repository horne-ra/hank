"use client";

import { LiveKitRoom, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";
import { SessionView } from "./SessionView";

type Props = {
  token: string;
  serverUrl: string;
  initialMessage?: string;
  onEnd: () => void;
};

export function TutorRoom({ token, serverUrl, initialMessage, onEnd }: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect
      audio
      video={false}
      onDisconnected={onEnd}
      className="h-dvh flex flex-col"
    >
      <SessionView initialMessage={initialMessage} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}
