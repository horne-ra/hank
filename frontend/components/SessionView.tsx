"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectionState } from "livekit-client";
import {
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { useTranscriptHistory } from "../hooks/useTranscriptHistory";
import { Transcript } from "./Transcript";
import { Visualizer } from "./Visualizer";

type ActiveTab = "HANK" | "TRANSCRIPT";

type Props = {
  initialMessage?: string;
};

export function SessionView({ initialMessage }: Props) {
  const room = useRoomContext();
  const connectionState = useConnectionState(room);
  const { state, agentTranscriptions } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const history = useTranscriptHistory();

  const preseedDone = useRef(false);
  useEffect(() => {
    if (!initialMessage || connectionState !== ConnectionState.Connected) return;
    if (preseedDone.current) return;
    // TODO: agent-side handling for pre-seeded messages
    const payload = JSON.stringify({
      type: "user_message",
      text: initialMessage,
    });
    preseedDone.current = true;
    room.localParticipant
      .publishData(new TextEncoder().encode(payload), { reliable: true })
      .catch(() => {
        preseedDone.current = false;
      });
  }, [connectionState, initialMessage, room]);

  const [activeTab, setActiveTab] = useState<ActiveTab>("HANK");

  const vizActive = state === "listening" || state === "speaking";

  const caption =
    agentTranscriptions[agentTranscriptions.length - 1]?.text ??
    "Hank is listening...";

  const micOn = isMicrophoneEnabled;

  function toggleMic() {
    void localParticipant.setMicrophoneEnabled(!micOn);
  }

  function handleEndCall() {
    void room.disconnect();
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <header className="h-14 border-b border-[#262626] flex items-center justify-between px-4 bg-[#0a0a0a] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 bg-amber-500" />
          <span className="text-sm font-bold text-white tracking-tight">Hank</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-neutral-400">Live Session</span>
          <motion.div
            className="w-1.5 h-1.5 bg-amber-500 rounded-full"
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[10px] font-bold text-amber-500 tracking-tighter">LIVE</span>
        </div>
      </header>

      <div className="flex justify-center gap-3 p-4 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab("HANK")}
          className={`px-6 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
            activeTab === "HANK"
              ? "border border-amber-500 text-amber-500"
              : "border border-[#262626] text-neutral-500"
          }`}
        >
          Hank
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("TRANSCRIPT")}
          className={`px-6 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase transition-all ${
            activeTab === "TRANSCRIPT"
              ? "border border-amber-500 text-amber-500"
              : "border border-[#262626] text-neutral-500"
          }`}
        >
          Transcript
        </button>
      </div>

      <main
        className={`flex-1 relative flex flex-col px-8 min-h-0 ${
          activeTab === "HANK" ? "items-center justify-center" : "items-stretch justify-start pt-2"
        }`}
      >
        <AnimatePresence mode="wait">
          {activeTab === "HANK" ? (
            <motion.div
              key="hank-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center w-full"
            >
              <Visualizer isActive={vizActive} />
              <div className="mt-16 text-center">
                <p className="text-lg font-medium text-white leading-snug">{caption}</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="transcript-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-col flex-1 w-full min-h-0"
            >
              <Transcript history={history} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="h-32 flex items-center justify-center gap-8 bg-[#0a0a0a] shrink-0">
        <button
          type="button"
          onClick={toggleMic}
          className="w-14 h-14 rounded-full flex items-center justify-center transition-all bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]"
          aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
        >
          {micOn ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
        </button>
        <button
          type="button"
          onClick={handleEndCall}
          className="w-14 h-14 rounded-full border border-red-500/50 text-red-500 flex items-center justify-center active:bg-red-500/10 transition-colors"
          aria-label="End call"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </footer>
    </div>
  );
}
