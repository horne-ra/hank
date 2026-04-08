"use client";

import { useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  VoiceAssistantControlBar,
  useVoiceAssistant,
  BarVisualizer,
} from "@livekit/components-react";
import "@livekit/components-styles";

type TokenResponse = { token: string; url: string; room_name: string };

export default function Home() {
  const [conn, setConn] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setError(null);
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      const data = (await res.json()) as TokenResponse;
      setConn(data);
    } catch (err) {
      setError(String(err));
    }
  }

  function disconnect() {
    setConn(null);
  }

  if (!conn) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-3xl font-bold">Hank — Phase 4 wiring test</h1>
        <button
          onClick={connect}
          className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg"
        >
          Start talking to Hank
        </button>
        {error && <p className="text-red-500">{error}</p>}
      </main>
    );
  }

  return (
    <LiveKitRoom
      token={conn.token}
      serverUrl={conn.url}
      connect
      audio
      video={false}
      onDisconnected={disconnect}
      className="min-h-dvh"
    >
      <SessionView onEnd={disconnect} />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function SessionView({ onEnd }: { onEnd: () => void }) {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 p-8">
      <p className="text-sm uppercase tracking-wider text-neutral-500">
        Status: {state}
      </p>
      <div className="w-64 h-32">
        <BarVisualizer state={state} barCount={7} trackRef={audioTrack} />
      </div>
      <VoiceAssistantControlBar />
      <button
        onClick={onEnd}
        className="px-4 py-2 border border-red-500 text-red-500 rounded-lg"
      >
        End session
      </button>
    </main>
  );
}
