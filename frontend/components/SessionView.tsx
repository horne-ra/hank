"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ConnectionState,
  DisconnectReason,
  RoomEvent,
} from "livekit-client";
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
  onUnexpectedDisconnect?: (message: string) => void;
};

export function SessionView({
  initialMessage,
  onUnexpectedDisconnect,
}: Props) {
  const room = useRoomContext();

  useEffect(() => {
    if (!room) return;

    const handleDisconnect = (reason?: DisconnectReason) => {
      if (reason === DisconnectReason.CLIENT_INITIATED || reason === undefined) {
        return;
      }

      let message = "Lost connection to Hank.";
      if (reason === DisconnectReason.SERVER_SHUTDOWN) {
        message = "Hank's session was interrupted. Please start a new one.";
      } else if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
        message = "Another session for this user was started. Please refresh.";
      } else if (reason === DisconnectReason.PARTICIPANT_REMOVED) {
        message = "You were removed from the session.";
      } else if (reason === DisconnectReason.ROOM_DELETED) {
        message = "The session was closed. Please start a new one.";
      } else if (reason === DisconnectReason.STATE_MISMATCH) {
        message = "Session state became inconsistent. Please refresh.";
      }

      onUnexpectedDisconnect?.(message);
    };

    room.on(RoomEvent.Disconnected, handleDisconnect);
    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnect);
    };
  }, [room, onUnexpectedDisconnect]);
  const connectionState = useConnectionState(room);
  const { state, agentTranscriptions } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const history = useTranscriptHistory();

  const preseedDone = useRef(false);
  const [preseedRetry, setPreseedRetry] = useState(0);
  const preseedInFlight = useRef(false);
  const MAX_PRESEED_ATTEMPTS = 4;
  const BASE_DELAY = 500;
  const MAX_DELAY = 4000;
  useEffect(() => {
    if (!initialMessage || connectionState !== ConnectionState.Connected) return;
    if (preseedDone.current || preseedInFlight.current) return;
    if (preseedRetry >= MAX_PRESEED_ATTEMPTS) return;
    const payload = JSON.stringify({
      type: "user_message",
      text: initialMessage,
    });
    preseedInFlight.current = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    room.localParticipant
      .publishData(new TextEncoder().encode(payload), { reliable: true })
      .then(() => {
        preseedDone.current = true;
      })
      .catch(() => {
        preseedInFlight.current = false;
        const delay = Math.min(BASE_DELAY * 2 ** preseedRetry, MAX_DELAY);
        retryTimer = setTimeout(() => {
          setPreseedRetry((n) => n + 1);
        }, delay);
      });
    return () => {
      clearTimeout(retryTimer);
    };
  }, [connectionState, initialMessage, room, preseedRetry]);

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
