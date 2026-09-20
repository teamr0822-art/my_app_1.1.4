"use client";

import { useEffect, useState } from "react";
import { MapIcon, MicIcon, SparkIcon } from "@/components/icons";

const SEEN_KEY = "yorimikke-onboarded-v1";

/**
 * はじめての画面のいちばん上に出す、このアプリの言い分。
 *
 * ここは最初の数秒で「何のアプリか」を決める場所なので、機能の説明ではなく
 * 何のために作ったかを置く。主張は「新しい名所を作らない」こと——人気の一点
 * に人を集め直すのでは、これまでと変わらない。街じゅうに散らばった小さな
 * 場所へ人を分散させることが目的だと、最初に言い切る。
 *
 * 同時に、期待値も正直に合わせる。有名観光地の案内は出てこない。それを先に
 * 言っておかないと、使ってみた人が「こんなものか」と離れてしまう。
 * 文言を変えるときは、この4つの定数だけ直せば済む。
 */
const CREED_TITLE = ["行列のできる一か所より、", "誰も止まらない百か所へ。"];
const CREED_BODY =
  "新しい人気スポットを作っても、人がそこに集まり直すだけです。よりみっけが目指すのは、街じゅうに散らばった小さな史跡へ、人が少しずつ流れていくこと。その積み重ねが地域を元気にすると考えています。";
/** 期待値を先に合わせる一文。 */
const CREED_NOTE =
  "だから、有名な観光地は出てきません。出てくるのは、地図に載っていても誰も足を止めない場所です。";
/** 中身の規模を一目で。数は data/spots.json の実数。 */
const CREED_FACTS = ["高知・広島・指宿", "151か所", "うち指定文化財60件"];

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      /* 上下に分ける。空いていた上半分が理念、下がこれまでの操作説明。
         背景は上ほど濃い夜空にして、白い文字が必ず読めるようにする。 */
      className="fixed inset-0 z-[900] flex flex-col justify-between bg-[linear-gradient(180deg,rgba(16,26,45,0.92)_0%,rgba(22,38,62,0.86)_45%,rgba(0,0,0,0.5)_100%)] px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-[calc(28px+env(safe-area-inset-top))] backdrop-blur-[2px]"
    >
      {/* 理念。打ち上げ花火を背に、大きく置く。 */}
      <div className="relative mx-auto flex w-full max-w-[432px] flex-1 flex-col justify-center overflow-hidden">
        <Firework />
        <p className="relative font-mono text-[11px] tracking-[0.3em] text-[var(--color-sun)]">
          YORIMIKKE
        </p>
        {/* 小さい画面では詰める。iPhone SE 相当（高さ667px）でも切れないこと
            を実測して決めた寸法。 */}
        <h1 className="relative mt-3 text-[24px] font-extrabold leading-[1.3] tracking-tight text-white text-balance [@media(min-height:740px)]:text-[30px]">
          {CREED_TITLE.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        <p className="relative mt-3 max-w-[22em] text-[12px] leading-6 text-white/85 [@media(min-height:740px)]:mt-4 [@media(min-height:740px)]:text-[13px] [@media(min-height:740px)]:leading-7">
          {CREED_BODY}
        </p>
        <p className="relative mt-3 hidden max-w-[22em] border-l-2 border-[var(--color-sun)] pl-3 text-[11px] leading-5 text-white/75 [@media(min-height:640px)]:block [@media(min-height:740px)]:text-[12px] [@media(min-height:740px)]:leading-6">
          {CREED_NOTE}
        </p>
        {/* 画面が低いときは省く。切れて見えるより、無いほうがいい。 */}
        <div className="relative mt-4 hidden flex-wrap gap-1.5 [@media(min-height:700px)]:flex">
          {CREED_FACTS.map((fact) => (
            <span
              key={fact}
              className="rounded-full border border-white/25 px-2.5 py-1 text-[11px] font-bold text-white/85"
            >
              {fact}
            </span>
          ))}
        </div>
      </div>

      <div className="anim-sheet mx-auto w-full max-w-[432px] shrink-0 rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-terracotta-soft)] text-[var(--color-terracotta)]"
          >
            {current.icon}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold tracking-wide text-[var(--color-terracotta)]">
              はじめかた {step + 1}／{STEPS.length}
            </p>
            <h2 id="onboarding-title" className="mt-0.5 text-[17px] font-extrabold">{current.title}</h2>
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
            className="flex min-h-11 items-center px-3 text-[12px] font-bold text-[var(--color-ink-soft)]"
          >
            スキップ
          </button>
          <button
            type="button"
            onClick={() => (last ? close() : setStep(step + 1))}
            className="flex min-h-11 items-center rounded-xl bg-[var(--color-terracotta)] px-5 text-[13px] font-bold text-white"
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

/**
 * 背景の花火。ホーム画面のヘッダーと同じモチーフを、理念の後ろに小さく敷く。
 * 装飾なので aria-hidden、動きは1回だけ（読む邪魔をしない）。
 */
function Firework() {
  const rays = Array.from({ length: 16 }, (_, i) => (i * 360) / 16);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      className="pointer-events-none absolute -right-8 -top-4 h-[230px] w-[230px] opacity-45"
    >
      {rays.map((deg) => (
        <line
          key={deg}
          x1="100"
          y1="100"
          x2={100 + Math.cos((deg * Math.PI) / 180) * 88}
          y2={100 + Math.sin((deg * Math.PI) / 180) * 88}
          stroke="var(--color-sun)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity={deg % 45 === 0 ? 0.9 : 0.45}
        />
      ))}
      <circle cx="100" cy="100" r="6" fill="#fff" />
    </svg>
  );
}
