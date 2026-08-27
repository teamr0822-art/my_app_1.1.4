"use client";

import { useEffect, useState } from "react";
import { MapIcon, MicIcon, SparkIcon } from "@/components/icons";

const SEEN_KEY = "yorimikke-onboarded-v1";

const STEPS = [
  {
    icon: <MicIcon size={26} />,
    title: "話しかけて、聞く",
    body: "気になった場所をひらいて、まんなかの丸をタップ。マイクで質問すると、その土地の話が返ってきます。",
    hint: "「いつ建てられたの？」「見どころは？」",
  },
  {
    icon: <SparkIcon size={26} />,
    title: "きょうの寄り道をつくる",
    body: "歩ける時間・移動手段・天気・気分をえらぶだけ。現在地のまわりから、無理のない道すじを組み立てます。",
    hint: "下の「ルート」から",
  },
  {
    icon: <MapIcon size={26} />,
    title: "地図でついていく",
    body: "現在地から次の目的地まで、曲がり角まで案内します。矢印が進む向き、番号が立ち寄る順番です。",
    hint: "下の「マップ」から",
  },
];

/**
 * Shown once, on the first visit. Three cards, because a first-time visitor
 * needs to know only three things: you can talk to a place, you can build a
 * walk, and the map will lead you there.
 */
export function Onboarding() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      /* private mode: just skip the tour */
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/45 px-4 pb-[calc(24px+env(safe-area-inset-bottom))] backdrop-blur-[2px]">
      <div className="anim-sheet w-full max-w-[432px] rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)]"
          >
            {current.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold tracking-wide text-[var(--color-terracotta)]">
              はじめかた {step + 1}／{STEPS.length}
            </p>
            <h2 className="mt-0.5 text-[17px] font-extrabold">{current.title}</h2>
          </div>
        </div>

        <p className="mt-3 text-[13px] leading-6">{current.body}</p>
        <p className="mt-2 rounded-xl bg-[var(--color-panel-soft)] px-3 py-2 text-[12px] text-[var(--color-ink-soft)]">
          {current.hint}
        </p>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step
                    ? "w-5 bg-[var(--color-terracotta)]"
                    : "w-1.5 bg-[var(--color-border)]"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={close}
            className="px-2 py-2 text-[12px] font-bold text-[var(--color-ink-soft)]"
          >
            スキップ
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : setStep(step + 1))}
            className="rounded-xl bg-[var(--color-terracotta)] px-5 py-2.5 text-[13px] font-bold text-white"
          >
            {last ? "はじめる" : "次へ"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lets the settings screen offer the tour again. */
export function replayOnboarding() {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}
