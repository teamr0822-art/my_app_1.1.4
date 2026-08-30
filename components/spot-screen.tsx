"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Nav } from "@/app/page";
import { getSpot } from "@/lib/spots";
import { useVoice } from "@/lib/use-voice";
import { useGuideChat } from "@/lib/use-guide-chat";
import { useSettings } from "@/lib/settings-context";
import {
  ChevronLeftIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  VolumeIcon,
  SparkIcon,
  MapIcon,
} from "@/components/icons";

const LeafletMap = dynamic(
  () => import("@/components/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#e8eadf] text-[12px] text-[var(--color-ink-soft)]">
        地図を読み込んでいます…
      </div>
    ),
  },
);

const QUESTION_CHIPS = [
  "いつ建てられたの？",
  "見どころを教えて",
  "名前の由来は？",
  "どんな歴史があるの？",
];

export function SpotScreen({ spotId, nav }: { spotId: string; nav: Nav }) {
  const spot = getSpot(spotId);
  const { muted, toggle } = useSettings();
  const voice = useVoice();
  // If the AI cannot answer, the guide still has the spot's own material.
  const chat = useGuideChat({
    spotId,
    mode: "spot",
    fallbackText: spot?.grounding?.trim()
      ? `いまAIとつながらないので、手元の資料からお伝えします。\n\n${spot.grounding.trim()}`
      : undefined,
  });
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const composingRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chat.messages]);

  // The spot screen hides the tab bar, so returning null here used to leave
  // the visitor on a blank page with no way back.
  if (!spot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-base font-semibold text-[var(--color-ink)]">
          このスポットの情報が見つかりませんでした
        </p>
        <button
          type="button"
          onClick={() => nav.go("home")}
          className="rounded-full bg-[var(--color-terracotta)] px-5 py-2 text-sm font-semibold text-white"
        >
          ホームに戻る
        </button>
      </div>
    );
  }

  const begin = () => {
    if (started) return;
    setStarted(true);
    const greeting = `こんにちは。${spot.name}へようこそ。わたしがこの場所をご案内します。気になることがあれば、マイクを押して話しかけてくださいね。`;
    chat.pushAssistant(greeting);
    voice.speak(greeting);
  };

  const ask = async (text: string) => {
    if (!started) setStarted(true);
    if (voice.speaking) voice.stopSpeaking();
    await chat.send(text, (full) => voice.speak(full));
  };

  const onMic = async () => {
    if (voice.speaking) voice.stopSpeaking();
    if (voice.recording) {
      const text = await voice.stopRecording();
      if (text) await ask(text);
    } else {
      await voice.startRecording((text) => { if (text) void ask(text); });
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = input.trim();
    if (!t) return;
    setInput("");
    await ask(t);
  };

  const busy = chat.streaming || voice.transcribing;

  return (
    <div className="flex flex-1 flex-col bg-[var(--color-bg)]">
      {/* Header */}
      <header className="z-10 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-panel)] px-3 pb-3 pt-[calc(14px+env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => nav.go("home")}
          aria-label="スポット一覧に戻る"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] active:bg-[var(--color-panel-soft)]"
        >
          <ChevronLeftIcon size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-extrabold leading-tight">
            {spot.name}
          </p>
          <p className="truncate text-[11px] text-[var(--color-ink-soft)]">
            {spot.designation}・{spot.category}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggle("muted")}
          aria-label={muted ? "ミュートを解除" : "ミュートにする"}
          aria-pressed={muted}
          className={`flex h-9 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold ${
            muted
              ? "border-[var(--color-mute-border)] bg-[var(--color-mute-bg)] text-[var(--color-mute-ink)]"
              : "border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-ink-soft)]"
          }`}
        >
          {muted ? <MicOffIcon size={16} /> : <VolumeIcon size={16} />}
          {muted ? "ミュート中" : "音声ON"}
        </button>
      </header>

      {/* Map preview */}
      <div className="relative h-[150px] shrink-0">
        <LeafletMap
          className="absolute inset-0"
          center={[spot.lat, spot.lng]}
          zoom={16}
          spots={[spot]}
          activeId={spot.id}
        />
      </div>

      {/* Access info for publicly-visitable sites */}
      {spot.access && (
        <div className="flex shrink-0 items-start gap-2 border-b border-[var(--color-border)] bg-[var(--color-green-soft)] px-4 py-2.5">
          <MapIcon size={15} className="mt-0.5 shrink-0 text-[var(--color-green)]" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--color-green)]">
              一般見学について
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--color-ink)]">
              {spot.access}
            </p>
          </div>
        </div>
      )}

      {!started ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
          <button
            type="button"
            onClick={begin}
            aria-label="案内をはじめる"
            className="anim-breathe relative flex h-32 w-32 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-6xl text-white shadow-xl"
          >
            <span aria-hidden="true">{spot.icon}</span>
            <span className="anim-mic absolute inset-0 rounded-full" />
          </button>
          <div>
            <p className="text-[16px] font-extrabold">タップして案内をはじめる</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">
              {muted
                ? "ミュートモード中：音声は流れず、文字でご案内します"
                : "タップすると、この場所の話をはじめます"}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Chat log */}
          <div
            ref={logRef}
            className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            {chat.messages.map((m) =>
              m.role === "assistant" ? (
                <div key={m.id} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-base text-white"
                  >
                    {spot.icon}
                  </span>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere]">
                    {m.content || (
                      <span className="anim-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-terracotta)] align-middle" />
                    )}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-[var(--color-green)] px-3.5 py-2.5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] text-white">
                    {m.content}
                  </div>
                </div>
              ),
            )}
            {voice.transcribing && (
              <div className="flex justify-end">
                <div className="rounded-2xl rounded-tr-md bg-[var(--color-green-soft)] px-3.5 py-2.5 text-[13px] text-[var(--color-green)]">
                  聞き取り中…
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="border-t border-[var(--color-border)] bg-[var(--color-panel)] px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
            <div className="no-scrollbar mb-2.5 flex gap-2 overflow-x-auto">
              {QUESTION_CHIPS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  disabled={busy || voice.recording}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink)] disabled:opacity-50"
                >
                  <SparkIcon size={13} className="text-[var(--color-terracotta)]" />
                  {q}
                </button>
              ))}
            </div>

            <form className="flex items-center gap-2" onSubmit={onSubmit}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onCompositionStart={() => (composingRef.current = true)}
                onCompositionEnd={() => (composingRef.current = false)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (composingRef.current || e.nativeEvent.isComposing || e.keyCode === 229)
                  ) {
                    e.preventDefault();
                  }
                }}
                placeholder="質問を入力…"
                aria-label="質問を入力"
                disabled={busy}
                className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[14px] outline-none focus:border-[var(--color-terracotta)] disabled:opacity-60"
              />
              {input.trim() ? (
                <button
                  type="submit"
                  disabled={busy}
                  aria-label="送信"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-green)] text-white disabled:opacity-50"
                >
                  <SendIcon size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onMic}
                  disabled={busy && !voice.recording}
                  aria-label={voice.recording ? "録音を停止" : "マイクで話す"}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-50 ${
                    voice.recording
                      ? "anim-mic bg-[var(--color-mute-accent)]"
                      : "bg-[var(--color-terracotta)]"
                  }`}
                >
                  {voice.transcribing ? (
                    <span className="anim-spin inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" />
                  ) : voice.recording ? (
                    <MicOffIcon size={20} />
                  ) : (
                    <MicIcon size={20} />
                  )}
                </button>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
