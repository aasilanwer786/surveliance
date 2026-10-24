import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { tokens } from "./api";
import { speakVoiceAlert } from "./voice";

export interface WsMessage {
  type: string;
  data?: any;
  at?: string;
}

interface WsCtx {
  connected: boolean;
  lastMessage: WsMessage | null;
  subscribe: (fn: (msg: WsMessage) => void) => () => void;
}

const Ctx = createContext<WsCtx | null>(null);

export function WsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const listeners = useRef(new Set<(msg: WsMessage) => void>());
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const access = tokens.access;
      if (!access) {
        timer = setTimeout(connect, 3000);
        return;
      }
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(access)}`);
      socketRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage;
          setLastMessage(msg);
          if (msg.type === "voice-alert" && msg.data) speakVoiceAlert(msg.data);
          for (const fn of listeners.current) fn(msg);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        setConnected(false);
        socketRef.current = null;
        if (closed) return;
        retryRef.current = Math.min(retryRef.current + 1, 6);
        timer = setTimeout(connect, Math.min(1000 * 2 ** retryRef.current, 15000));
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
      setConnected(false);
    };
  }, [enabled]);

  const subscribe = useCallback((fn: (msg: WsMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  return <Ctx.Provider value={{ connected, lastMessage, subscribe }}>{children}</Ctx.Provider>;
}

export function useWs(): WsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWs must be used inside WsProvider");
  return ctx;
}
