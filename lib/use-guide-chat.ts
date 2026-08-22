"use client";

import { useCallback, useRef, useState } from "react";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ExtraPayload = {
  spotId?: string;
  mode?: "spot" | "companion" | "route";
  nearby?: { name: string; grounding: string }[];
};

let idc = 0;
const nextId = () => `m${Date.now()}_${idc++}`;

export function useGuideChat(extra: ExtraPayload) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const extraRef = useRef(extra);
  extraRef.current = extra;

  // keep a ref of messages for send() closure
  const messagesRef = useRef<ChatMsg[]>([]);
  messagesRef.current = messages;

  const reset = useCallback((seed?: ChatMsg[]) => {
    setMessages(seed ?? []);
  }, []);

  const pushAssistant = useCallback((content: string) => {
    setMessages((m) => [...m, { id: nextId(), role: "assistant", content }]);
  }, []);

  const send = useCallback(
    async (text: string, onComplete?: (full: string) => void): Promise<string> => {
      const clean = text.trim();
      if (!clean) return "";

      const userMsg: ChatMsg = { id: nextId(), role: "user", content: clean };
      const history = [...messagesRef.current, userMsg];
      setMessages(history);
      setStreaming(true);

      const assistantId = nextId();
      setMessages((m) => [...m, { id: assistantId, role: "assistant", content: "" }]);

      let full = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            ...extraRef.current,
          }),
        });
        if (!res.ok || !res.body) {
          const detail = await res.text();
          throw new Error(detail || `ルート作成に失敗しました（${res.status}）。`);
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/plain")) {
          const payload = await res.json().catch(() => null);
          const text = typeof payload?.text === "string" ? payload.text : typeof payload?.message === "string" ? payload.message : "";
          if (!text) throw new Error("AIから有効な回答が返りませんでした。");
          full = text;
          setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, content: full } : msg));
          return full;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, content: full } : msg)),
          );
        }
      } catch (error) {
        console.log("[v0] route generation fallback", error);
        full = extraRef.current.mode === "route"
          ? "AIに接続できなかったため、登録済みスポットから概算ルートを作成できませんでした。もう一度試すか、条件を短くしてお試しください。"
          : "申し訳ありません。うまく応答できませんでした。もう一度お試しください。";
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, content: full } : msg)),
        );
      } finally {
        setStreaming(false);
      }
      if (!full.trim()) {
        full = extraRef.current.mode === "route"
          ? "AIから空の回答が返りました。条件を少し変えて、もう一度お試しください。"
          : "回答を受け取れませんでした。もう一度お試しください。";
        setMessages((m) => m.map((msg) => msg.id === assistantId ? { ...msg, content: full } : msg));
      }
      onComplete?.(full);
      return full;
    },
    [],
  );

  return { messages, streaming, send, reset, pushAssistant, setMessages };
}
