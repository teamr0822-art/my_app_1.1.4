"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Nav } from "@/app/page";
import { SPOTS, areaOf, nearestSpot, distanceMeters, formatDistance } from "@/lib/spots";
import { useGeolocation } from "@/lib/use-geolocation";
import { useVoice } from "@/lib/use-voice";
import { useGuideChat } from "@/lib/use-guide-chat";
import { useSettings } from "@/lib/settings-context";
import {
  SparkIcon,
  CloseIcon,
  MicIcon,
  MicOffIcon,
  SendIcon,
  VolumeIcon,
} from "@/components/icons";

export function CompanionLayer({
  nav,
  bottomNavVisible,
}: {
  nav: Nav;
  bottomNavVisible: boolean;
}) {
  const { companionOn, companionAutoListen, muted, toggle } = useSettings();
  const geo = useGeolocation();
  const voice = useVoice();

  // The spot screen has its own microphone button in the same corner; two
  // round buttons stacked on top of each other is unusable on a phone.
  const micScreen = nav.screen === "spot";

  const near = useMemo(() => nearestSpot(geo.pos), [geo.pos]);

  // Three nearest spots as grounding context for the companion.
  const nearby = useMemo(() => {
    return [...SPOTS]
      .map((s) => ({ s, d: distanceMeters(geo.pos, [s.lat, s.lng]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map(({ s }) => ({ name: s.name, grounding: s.grounding, city: areaOf(s) }));
  }, [geo.pos]);

  const chat = useGuideChat({
    mode: "companion",
    nearby,
    fallbackText: nearby[0]?.grounding?.trim()
      ? `いまAIとつながらないので、手元の資料からお話ししますね。\n\n${nearby[0].name}\n${nearby[0].grounding.trim()}`
      : undefined,
  });
  const [open, setOpen] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [input, setInput] = useState("");
  const composingRef = useRef(false);
  const logRef = useRef<HTMLDivElement | null>(null);
  // Guards the hands-free listening loop.
  const loopRef = useRef(false);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [chat.messages]);

  // Hands-free loop: listen (until silence) -> ask -> speak -> listen again.
  // Guarded by loopRef so closing the overlay stops it cleanly.
  const startListenLoop = async () => {
    if (muted || !loopRef.current) return;
    const text = await voice.listenOnce();
    if (!loopRef.current) return;
    if (text) {
      await ask(text);
    } else {
      loopRef.current = false;
    }
  };

  const ask = async (text: string) => {
    if (!text.trim()) return;
    if (voice.speaking) voice.stopSpeaking();
    await chat.send(text, (full) => {
      voice.speak(full, {
        onEnd: () => {
          if (loopRef.current && companionAutoListen && !muted) startListenLoop();
        },
      });
    });
  };

  const canHandsFree = companionAutoListen && !muted && voice.browserSRAvailable;

  const closeOverlay = () => {
    loopRef.current = false;
    voice.abortListening();
    voice.stopSpeaking();
    setOpen(false);
  };

  const openOverlay = () => {
    setOpen(true);
    if (!greeted) {
      setGreeted(true);
      const dist = formatDistance(near.meters);
      const greeting = `こんにちは、お散歩のお供です。いまは${near.spot.name}のあたり（およそ${dist}）にいますね。この近くの歴史や見どころ、気になることがあれば気軽に話しかけてください。`;
      chat.pushAssistant(greeting);
      voice.speak(greeting, {
        onEnd: () => {
          if (canHandsFree) {
            loopRef.current = true;
            startListenLoop();
          }
        },
      });
    } else if (canHandsFree) {
      loopRef.current = true;
      startListenLoop();
    }
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

  if (!companionOn) return null;

  const busy = chat.streaming || voice.transcribing;

  return (
    <>
      {/* Floating companion button */}
      {!open && !micScreen && (
        <button
          type="button"
          onClick={openOverlay}
          aria-label="お散歩コンパニオンを開く"
          className="anim-breathe fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-green)] text-white shadow-xl"
          style={{
            bottom: `calc(${bottomNavVisible ? 86 : 20}px + env(safe-area-inset-bottom))`,
          }}
        >
          <SparkIcon size={24} />
        </button>
      )}

      {/* Overlay */}
      {open && (
        <div
          /* Above the fixed tab bar (z-600): at z-50 the tab bar rendered on
             top of this full-screen sheet on the home, route and map screens. */
          role="dialog"
          aria-modal="true"
          aria-label="おさんぽコンパニオン"
          className="fixed inset-0 z-[700] flex flex-col bg-black/40"
        >
          <button
            type="button"
            aria-label="閉じる"
            className="flex-1"
            onClick={closeOverlay}
          />
          <div className="rounded-t-3xl border-t border-[var(--color-border)] bg-[var(--color-panel)] pb-[calc(12px+env(safe-area-inset-bottom))] shadow-2xl">
            {/* Handle + header */}
            <div className="flex items-center gap-2 px-4 pb-2 pt-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-green)] text-white"
              >
                <SparkIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-extrabold leading-tight">
                  歩きながら雑談
                </p>
                <p className="truncate text-[12px] text-[var(--color-ink-soft)]">
                  近くの{near.spot.name}・{formatDistance(near.meters)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggle("muted")}
                aria-label={muted ? "ミュートを解除" : "ミュートにする"}
                aria-pressed={muted}
                className={`flex h-11 items-center gap-1 rounded-full border px-3 text-[12px] font-bold ${
                  muted
                    ? "border-[var(--color-mute-border)] bg-[var(--color-mute-bg)] text-[var(--color-mute-ink)]"
                    : "border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-ink-soft)]"
                }`}
              >
                {muted ? <MicOffIcon size={14} /> : <VolumeIcon size={14} />}
                {muted ? "ミュート" : "音声"}
              </button>
              <button
                type="button"
                onClick={closeOverlay}
                aria-label="閉じる"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)] active:bg-[var(--color-panel-soft)]"
              >
                <CloseIcon size={18} />
              </button>
            </div>

            {/* Chat log */}
            <div
              ref={logRef}
            aria-live="polite"
            aria-relevant="additions text"
              className="flex max-h-[42vh] min-h-[180px] flex-col gap-3 overflow-y-auto border-t border-[var(--color-border)] px-4 py-3"
            >
              {chat.messages.map((m) =>
                m.role === "assistant" ? (
                  <div key={m.id} className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-green)] text-white"
                    >
                      <SparkIcon size={14} />
                    </span>
                    <div className="max-w-[82%] rounded-2xl rounded-tl-md border border-[var(--color-border)] bg-[var(--color-panel-soft)] px-3.5 py-2.5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere]">
                      {m.content || (
                        <span role="status" aria-label="考えています" className="anim-spin inline-block h-3.5 w-3.5 rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-green)] align-middle" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[82%] rounded-2xl rounded-tr-md bg-[var(--color-green)] px-3.5 py-2.5 text-[14px] leading-relaxed break-words [overflow-wrap:anywhere] text-white">
                      {m.content}
                    </div>
                  </div>
                ),
              )}
              {voice.recording && (
                <p className="text-center text-[12px] font-medium text-[var(--color-green)]">
                  聞いています…話しかけてください
                </p>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 px-3 pt-3">
              <label className="flex items-center gap-1.5 text-[12px] font-medium text-[var(--color-ink-soft)]">
                <input
                  type="checkbox"
                  checked={companionAutoListen}
                  onChange={() => toggle("companionAutoListen")}
                  className="h-3.5 w-3.5 accent-[var(--color-green)]"
                />
                ハンズフリー
              </label>
              <form className="flex flex-1 items-center gap-2" onSubmit={onSubmit}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onCompositionStart={() => (composingRef.current = true)}
                  onCompositionEnd={() => (composingRef.current = false)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      (composingRef.current ||
                        e.nativeEvent.isComposing ||
                        e.keyCode === 229)
                    ) {
                      e.preventDefault();
                    }
                  }}
                  placeholder="話しかける / 入力…"
                  aria-label="コンパニオンに話しかける"
                  disabled={busy}
                  className="min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-[14px] outline-none focus:border-[var(--color-green)] disabled:opacity-60"
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
                    disabled={muted || (busy && !voice.recording)}
                    aria-label={muted ? "ミュート中はマイクを使えません" : voice.recording ? "録音を停止" : "マイクで話す"}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40 ${
                      voice.recording
                        ? "anim-mic bg-[var(--color-mute-accent)]"
                        : "bg-[var(--color-green)]"
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
          </div>
        </div>
      )}
    </>
  );
}
