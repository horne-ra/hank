"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TutorRoom } from "@/components/TutorRoom";
import { WelcomeScreen } from "@/components/WelcomeScreen";

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
  const [view, setView] = useState<"welcome" | "active">("welcome");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialMessage, setInitialMessage] = useState<string | undefined>(
    undefined
  );

  const connectingRef = useRef(false);

  async function onStart(seed?: string) {
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

  function onEnd() {
    setConnection(null);
    setInitialMessage(undefined);
    setView("welcome");
  }

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a] overflow-hidden">
      <AnimatePresence mode="wait">
        {view === "welcome" ? (
          <WelcomeScreen
            key="welcome"
            onStart={onStart}
            isConnecting={isConnecting}
            error={error}
          />
        ) : connection ? (
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
              onEnd={onEnd}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
