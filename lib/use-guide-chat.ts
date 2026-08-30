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
  /**
   * Shown verbatim when the AI cannot answer at all. Callers pass the spot's
   * own source material, so an outage degrades to "read the material" instead
   * of an apology with nothing behind it.
   */
  fallbackText?: string;
};

/** Bound every request so a stalled network cannot freeze the UI. */
const REQUEST_TIMEOUT_MS = 30_000;

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

      // A hung fetch is worse than a failed one: the screen would sit on
      // "考え中" forever. Every attempt is bounded, and a transient failure is
      // retried once before the visitor is told anything went wrong.
      const attempt = async (signal: AbortSignal): Promise<string> => {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            spotId: extraRef.current.spotId,
            mode: extraRef.current.mode,
            nearby: extraRef.current.nearby,
          }),
        });
        if (!res.ok || !res.body) {
          const detail = await res.text().catch(() => "");
          // Some responses (400/405 guards) carry an English developer message.
          // Only surface the body when it is a message written for the visitor;
          // otherwise fall back to a Japanese sentence.
          const readable = /[぀-ヿ一-鿿]/.test(detail) ? detail.trim() : "";
          const error = new Error(readable || `通信に失敗しました（${res.status}）。`);
          (error as { status?: number }).status = res.status;
          throw error;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/plain")) {
          const payload = await res.json().catch(() => null);
          const text =
            typeof payload?.text === "string"
              ? payload.text
              : typeof payload?.message === "string"
                ? payload.message
                : "";
          if (!text) throw new Error("AIから有効な回答が返りませんでした。");
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, content: text } : msg)),
          );
          return text;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((m) =>
            m.map((msg) => (msg.id === assistantId ? { ...msg, content: acc } : msg)),
          );
        }
        return acc;
      };

      let full = "";
      try {
        for (let tryIndex = 0; tryIndex < 2; tryIndex++) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
          try {
            full = await attempt(controller.signal);
            if (full.trim()) break;
          } catch (error) {
            const status = (error as { status?: number })?.status;
            const retryable = status === undefined || status >= 500 || status === 429;
            if (tryIndex === 1 || !retryable) throw error;
            console.log("[v0] chat retry after", error);
            await new Promise((r) => setTimeout(r, 900));
          } finally {
            clearTimeout(timer);
          }
        }
      } catch (error) {
        console.log("[v0] chat failed", error);
        full = "";
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, content: "" } : msg)),
        );
      } finally {
        setStreaming(false);
      }

      if (!full.trim()) {
        full = extraRef.current.mode === "route"
          ? "いまルートを作れませんでした。通信状況を確認して、条件を少し変えてもう一度お試しください。"
          : extraRef.current.fallbackText?.trim()
            ? extraRef.current.fallbackText.trim()
            : "いま応答を受け取れませんでした。少し待ってからもう一度お試しください。";
        setMessages((m) =>
          m.map((msg) => (msg.id === assistantId ? { ...msg, content: full } : msg)),
        );
      }
      onComplete?.(full);
      return full;
    },
    [],
  );

  return { messages, streaming, send, reset, pushAssistant, setMessages };
}
