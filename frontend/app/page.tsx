"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TutorRoom } from "@/components/TutorRoom";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { SummaryPanel } from "@/components/SummaryPanel";

type Connection = {
  token: string;
  serverUrl: string;
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
  const [view, setView] = useState<"welcome" | "active" | "summary">(
    "welcome"
  );
  const [connection, setConnection] = useState<Connection | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(
    undefined
  );

  const connectingRef = useRef(false);

  async function handleStart(seed?: string) {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
        throw new Error(
          detail || `Token fetch failed: ${res.status}`
        );
      }

      const data: unknown = await res.json();
      if (!isTokenResponse(data)) {
        throw new Error("Invalid token response from server");
      }

      setInitialMessage(seed);
      setSessionId(data.session_id);
      setConnection({
        token: data.token,
        serverUrl: data.url,
      });
      setView("active");
    } catch (err) {
      setError(String(err));
    } finally {
      connectingRef.current = false;
      setIsConnecting(false);
    }
  }

  function handleSessionEnd() {
    setConnection(null);
    setInitialMessage(undefined);
    setView("summary");
  }

  function handleNewSession(initialMessageArg?: string) {
    setConnection(null);
    setSessionId(null);
    setError(null);
    if (initialMessageArg === undefined) {
      setInitialMessage(undefined);
      setView("welcome");
    } else {
      void handleStart(initialMessageArg);
    }
  }

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      <AnimatePresence mode="wait">
        {view === "welcome" && (
          <WelcomeScreen
            key="welcome"
            onStart={handleStart}
            isConnecting={isConnecting}
            error={error}
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
              initialMessage={initialMessage}
              onEnd={handleSessionEnd}
            />
          </motion.div>
        )}
        {view === "summary" && sessionId !== null && (
          <motion.div
            key="summary"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col min-h-0 h-full w-full overflow-y-auto"
          >
            <SummaryPanel
              sessionId={sessionId}
              onNewSession={handleNewSession}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
