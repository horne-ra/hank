"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TutorRoom } from "@/components/TutorRoom";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { SessionDetail } from "@/components/SessionDetail";

type View = "welcome" | "active" | "session-detail";

type Connection = {
  token: string;
  serverUrl: string;
  sessionId: number;
};

type TokenResponse = {
  token: string;
  url: string;
  room_name: string;
  session_id: number;
};

function isTokenResponse(data: unknown): data is TokenResponse {
  if (typeof data !== "object" || data === null) return false;
  const o = data as Record<string, unknown>;
  return (
    typeof o.token === "string" &&
    o.token !== "" &&
    typeof o.url === "string" &&
    o.url !== "" &&
    typeof o.room_name === "string" &&
    o.room_name !== "" &&
    typeof o.session_id === "number" &&
    Number.isFinite(o.session_id)
  );
}

export default function Home() {
  const [view, setView] = useState<View>("welcome");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [viewingSessionId, setViewingSessionId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(
    undefined
  );

  const connectingRef = useRef(false);
  const disconnectHandledRef = useRef(false);

  async function handleStart(initialMsg?: string, resumeFromSessionId?: number) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    disconnectHandledRef.current = false;
    setIsConnecting(true);
    setConnectionError(null);
    setInitialMessage(initialMsg);
    try {
      const body: Record<string, unknown> = {};
      if (resumeFromSessionId) {
        body.resume_from_session_id = resumeFromSessionId;
      }
      if (initialMsg) {
        body.initial_message = initialMsg;
      }

      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let detail = "";
        try {
          const errJson: unknown = await res.json();
          if (typeof errJson === "object" && errJson !== null) {
            const e = errJson as { error?: unknown; detail?: unknown };
            const parts = [e.error, e.detail].filter(
              (x) => typeof x === "string" && x.length > 0
            ) as string[];
            detail = parts.join(": ");
          }
        } catch {
          /* ignore */
        }
        throw new Error(detail || `Token fetch failed: ${res.status}`);
      }

      const data: unknown = await res.json();
      if (!isTokenResponse(data)) {
        throw new Error("Invalid token response from server");
      }

      setConnection({
        token: data.token,
        serverUrl: data.url,
        sessionId: data.session_id,
      });
      setViewingSessionId(null);
      setView("active");
    } catch (err) {
      let message = "Couldn't reach Hank. Check your connection and try again.";
      if (err instanceof Error) {
        if (err.message.includes("502") || err.message.includes("503")) {
          message = "Hank's offline right now. Try again in a moment.";
        } else if (err.message.includes("400") || err.message.includes("422")) {
          message = "Couldn't start a session. Please refresh and try again.";
        }
      }
      setConnectionError(message);
    } finally {
      connectingRef.current = false;
      setIsConnecting(false);
    }
  }

  function handleSessionEnd() {
    setConnection(null);
    setInitialMessage(undefined);
    setView("welcome");
  }

  function handleClearError() {
    setConnectionError(null);
  }

  function handleUnexpectedDisconnect(message: string) {
    if (disconnectHandledRef.current) return;
    disconnectHandledRef.current = true;
    setConnection(null);
    setInitialMessage(undefined);
    setConnectionError(message);
    setView("welcome");
  }

  function handleViewSession(sessionId: number) {
    setViewingSessionId(sessionId);
    setView("session-detail");
  }

  function handleBackFromDetail() {
    setViewingSessionId(null);
    setView("welcome");
  }

  function handleResumeFromDetail(sessionId: number) {
    setViewingSessionId(null);
    void handleStart(undefined, sessionId);
  }

  function handleResumeFromList(sessionId: number) {
    void handleStart(undefined, sessionId);
  }

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      <AnimatePresence mode="wait">
        {view === "welcome" && (
          <WelcomeScreen
            key="welcome"
            onStart={handleStart}
            onViewSession={handleViewSession}
            onResumeSession={handleResumeFromList}
            onClearError={handleClearError}
            isConnecting={isConnecting}
            error={connectionError}
          />
        )}
        {view === "active" && connection && (
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col min-h-0 h-full w-full"
          >
            <TutorRoom
              token={connection.token}
              serverUrl={connection.serverUrl}
              sessionId={connection.sessionId}
              initialMessage={initialMessage}
              onEnd={handleSessionEnd}
              onUnexpectedDisconnect={handleUnexpectedDisconnect}
            />
          </motion.div>
        )}
        {view === "session-detail" && viewingSessionId !== null && (
          <motion.div
            key="session-detail"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col min-h-0 h-full w-full overflow-y-auto"
          >
            <SessionDetail
              key={viewingSessionId}
              sessionId={viewingSessionId}
              onBack={handleBackFromDetail}
              onResume={handleResumeFromDetail}
              onNewSessionFromTopic={(topic) => {
                handleBackFromDetail();
                void handleStart(topic);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
