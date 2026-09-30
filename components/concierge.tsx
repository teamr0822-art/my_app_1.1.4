"use client";

import { useEffect, useRef, useState } from "react";
import { SPOTS, areaOf, distanceMeters } from "@/lib/spots";
import { useLocation } from "@/lib/location-context";
import { useGuideChat } from "@/lib/use-guide-chat";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/lib/settings-context";
import { useVoice } from "@/lib/use-voice";
import { CloseIcon, SendIcon, SparkIcon, MicIcon } from "@/components/icons";

/**
 * 総合案内所。
 *
 * 観光案内所のカウンターのつもりで、アプリの使い方から「どこへ行けばいいか」
 * まで、まとめて相談できる場所。ホーム画面のいちばん目立つところから開く。
 *
 * ■ スポットの案内やお散歩コンパニオンとの違い
 * スポットの案内は「その場所」について、コンパニオンは歩きながらの雑談。
 * ここはその前段で、まだ何も決まっていない人が最初に来る場所。だから
 * アプリの説明（data/app-guide.json）を下敷きにして答える。
 */

/** 最初に出す相談の例。押すとそのまま質問できる。 */
const EXAMPLES = [
  "このアプリで何ができるの？",
  "2時間で回れるところは？",
  "はじめてなので、まず何をすればいい？",
  "見学するときに気をつけることは？",
];

export function ConciergeSheet({ onClose }: { onClose: () => void }) {
  const geo = useLocation();
  const { t, lang } = useI18n();
  const { muted } = useSettings();
  const voice = useVoice();
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement | null>(null);
  const composingRef = useRef(false);

  // 近くのスポットを渡しておくと、「近くでどこか」に具体的に答えられる。
  const nearby = [...SPOTS]
    .map((s) => ({ s, d: distanceMeters(geo.pos, [s.lat, s.lng]) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 8)
    .map(({ s }) => ({ name: s.name, grounding: s.grounding, city: areaOf(s) }));

  const chat = useGuideChat({ mode: "concierge", nearby, lang });

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chat.messages]);

  // 画面を閉じるときは、読み上げも必ず止める。
  useEffect(() => {
    return () => voice.stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ask = async (text: string) => {
    const q = text.trim();
    if (!q || chat.streaming) return;
    setInput("");
    const answer = await chat.send(q).catch(() => null);
    if (answer && !muted) voice.speak(answer);
  };

  const listen = async () => {
    const heard = await voice.listenOnce().catch(() => "");
    if (heard) ask(heard);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="concierge-title"
      className="fixed inset-0 z-[900] flex flex-col bg-[var(--color-bg)]"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))]">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)]"
        >
          <SparkIcon size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="concierge-title" className="text-[16px] font-extrabold">
            {t("総合案内所")}
          </h2>
          <p className="truncate text-[12px] text-[var(--color-ink-soft)]">
            {t("アプリの使い方も、どこへ行くかも相談できます")}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("閉じる")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)]"
        >
          <CloseIcon size={20} />
        </button>
      </header>

      <div ref={logRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <p className="text-[14px] leading-7">
              {t("ようこそ。よりみっけの案内係です。使い方でも、どこへ行くかでも、気軽に聞いてください。")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(t(q))}
                  className="flex min-h-11 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-4 text-[12.5px] font-medium"
                >
                  {t(q)}
                </button>
              ))}
            </div>
          </div>
        )}

        {chat.messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-7 ${
              m.role === "user"
                ? "ml-auto bg-[var(--color-terracotta)] text-white"
                : "border border-[var(--color-border)] bg-[var(--color-panel)]"
            }`}
          >
            {m.content}
          </div>
        ))}

        {chat.streaming && (
          <p className="text-[13px] text-[var(--color-ink-soft)]">{t("考えています")}…</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex shrink-0 items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2.5 pb-[calc(10px+env(safe-area-inset-bottom))]"
      >
        <button
          type="button"
          onClick={listen}
          aria-label={t("マイクで話す")}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
            voice.recording
              ? "bg-[var(--color-sunset)] text-white"
              : "border border-[var(--color-border)] text-[var(--color-ink-soft)]"
          }`}
        >
          <MicIcon size={20} />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onCompositionStart={() => (composingRef.current = true)}
          onCompositionEnd={() => (composingRef.current = false)}
          placeholder={t("質問を入力…")}
          aria-label={t("質問を入力")}
          className="min-h-12 min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-4 text-[16px] outline-none focus:border-[var(--color-terracotta)]"
        />
        <button
          type="submit"
          aria-label={t("送信")}
          aria-disabled={chat.streaming}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-white aria-disabled:opacity-50"
        >
          <SendIcon size={20} />
        </button>
      </form>
    </div>
  );
}
