"use client";

import type { Nav } from "@/app/page";
import {
  SPOTS,
  STATS,
  DATA_SOURCE,
  formatDistance,
  distanceMeters,
  spotsInArea,
} from "@/lib/spots";
import { useLocation } from "@/lib/location-context";
import { useT } from "@/lib/i18n";
import { useState } from "react";
import { ConciergeSheet } from "@/components/concierge";
import { LocationBanner } from "@/components/location-banner";
import { useVisited } from "@/lib/visited";
import { hoursOf } from "@/lib/visit-hours";
import { dwellMinutes } from "@/lib/route-estimate";
import { ChevronLeftIcon, MicIcon, SparkIcon } from "@/components/icons";

/**
 * ホームのいちばん上で選べる「残り時間」。
 *
 * ホームに来る人がまず持っているのは行き先ではなく「あと何分あるか」なので、
 * それをそのまま押せるようにして、ルート作成へ条件ごと渡す。
 */
const TIME_CHIPS = [
  { label: "30分", minutes: 30 },
  { label: "1時間", minutes: 60 },
  { label: "2時間", minutes: 120 },
  { label: "半日", minutes: 240 },
];

export function HomeScreen({ nav }: { nav: Nav }) {
  const { pos, canMeasure, areaLabel } = useLocation();
  const t = useT();
  /** 総合案内所を開いているか。ホームからだけ開く。 */
  const [concierge, setConcierge] = useState(false);
  const visited = useVisited();

  // 測位できていないときは、基準の街のスポットだけを並べる。距離順だけだと、
  // スポットがまだ少ない街（松江市など）で、よその県の場所が「近く」に出てしまう。
  const pool = canMeasure ? SPOTS : spotsInArea(areaLabel);
  const spots = [...pool]
    .map((s) => ({ ...s, meters: distanceMeters(pos, [s.lat, s.lng]) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, 5);

  const nearest = spots[0];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto pb-[var(--tabbar-clearance)]">
      {/* Header */}
      {/*
        The header is the one place the app gets to set a mood, so it holds the
        evening sky the rest of the palette is drawn from: deep blue overhead,
        warming towards the horizon, with a firework opening over it. The
        gradient darkens upward on purpose — the title and the three figures sit
        in its darkest band, where white text measures better than 7:1.
      */}
      <header
        /* shrink-0 matters: `overflow-hidden` (needed so the firework is clipped
           to the sky) also lets this flex item shrink below its content and
           clip the title and the figures with it. */
        className="relative shrink-0 overflow-hidden bg-[linear-gradient(168deg,#2e2016_0%,#6b3a1f_50%,#b3652c_100%)] px-5 pb-6 pt-[calc(20px+env(safe-area-inset-top))] text-white"
      >
        <SeasonMotif />
        <h1 className="relative text-[28px] font-extrabold tracking-tight">{t("よりみっけ")}</h1>
        <p className="relative mt-1.5 text-[13px] font-medium leading-relaxed text-pretty">
          {t("知らなかった街の魅力を、旅の途中で見つけよう。")}
        </p>
        <p className="relative mt-2 text-[12px] leading-relaxed text-white/90 text-pretty">
          {t("気になった場所に話しかけると、その土地の物語が返ってきます。")}
        </p>

        {/* Stat banner: the unit goes with the number, so "48" is never a
            bare figure the reader has to decode. */}
        <div className="relative mt-4 flex gap-2">
          <Stat value={STATS.kunishitei} unit={t("件")} label={t("国の指定文化財")} />
          <Stat value={STATS.kenshitei} unit={t("件")} label={t("県の指定文化財")} />
          <Stat value={SPOTS.length} unit={t("か所")} label={t("話しかけられる")} />
        </div>
      </header>

      <LocationBanner />

      {/*
        いちばん上は「あと何分あるか」。
        ホームを開く時点で決まっているのは行き先ではなく残り時間なので、それを
        押すだけでルート作成に条件が渡るようにしている。カードを同じ大きさで
        並べると何から始めればいいか分からなくなるため、ここだけ大きくする。
      */}
      <section className="px-5 pt-4">
        <div className="rounded-2xl border border-[var(--color-terracotta)] bg-[var(--color-panel)] p-4">
          <p className="text-[12px] font-bold text-[var(--color-terracotta)]">
            {areaLabel
              ? t("いま{area}のあたり", { area: areaLabel })
              : t("いまいるあたり")}
          </p>
          <p className="mt-0.5 text-[18px] font-extrabold leading-snug text-pretty">
            {t("あと何分、寄り道できますか？")}
          </p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {TIME_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => nav.planRoute(c.minutes)}
                className="flex min-h-12 items-center justify-center rounded-xl bg-[var(--color-terracotta)] px-1 text-center text-[14px] font-extrabold leading-tight text-white transition active:scale-[0.97]"
              >
                {t(c.label)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-5 text-[var(--color-ink-soft)]">
            {t("選ぶと、その時間で回れる道すじを組みます。")}
          </p>
          <button
            type="button"
            onClick={() => nav.go("route")}
            className="mt-2 flex min-h-11 w-full items-center justify-center text-[12.5px] font-bold text-[var(--color-terracotta)]"
          >
            {t("時間や気分をじっくり決める")}
          </button>
        </div>
      </section>

      {/* 総合案内所。何をしたいか決まっていない人が最初に頼る場所なので、
          2つのボタンより上に、いちばん大きく置く。 */}
      <section className="px-5 pt-4">
        <button
          type="button"
          onClick={() => setConcierge(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-terracotta)] bg-[var(--color-terracotta-soft)] p-4 text-left transition active:scale-[0.99]"
        >
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-terracotta)] text-white"
          >
            <SparkIcon size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-extrabold text-[var(--color-terracotta)]">
              {t("総合案内所に聞く")}
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-5 text-[var(--color-ink-soft)]">
              {t("アプリの使い方から、どこへ行くかの相談まで")}
            </span>
          </span>
        </button>
      </section>

      {concierge && <ConciergeSheet onClose={() => setConcierge(false)} />}

      {/* Spots list */}
      <section className="px-5 pt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            <h2 className="text-[15px] font-extrabold">{t("近くの寄り道さき")}</h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-soft)]">
              {visited.count > 0
                ? t("タップすると、その場所の話を聞けます（これまでに{n}か所を訪問）", { n: visited.count })
                : t("タップすると、その場所の話を聞けます")}
            </p>
          </div>
          <span className="text-[12px] font-medium text-[var(--color-ink-soft)]">
            {canMeasure ? t("現在地から近い順") : t("{area}の順", { area: areaLabel || t("登録エリア") })}
          </span>
        </div>

        {spots.length === 0 && (
          <p className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-[13px] leading-relaxed text-[var(--color-ink-soft)]">
            {t("{area}のスポットは準備中です。上の帯の「いる街を選ぶ」から、ほかの街を選べます。", { area: areaLabel || t("この街") })}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {spots.map((s, i) => {
            // 見学できる時間と滞在の目安を、一覧の時点で見せる。
            // 「行ってみたら閉まっていた」「思ったより時間がかかった」は、
            // 開いてから分かっても手遅れになる情報なので。
            const w = hoursOf(s);
            const stay = dwellMinutes(s);
            const walkMin = canMeasure ? Math.max(1, Math.round(s.meters / 80)) : null;
            return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => nav.openSpot(s.id)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-left transition active:scale-[0.99]"
              >
                <span
                  aria-hidden="true"
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--color-panel-soft)] text-3xl"
                >
                  {s.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold">{s.name}</span>
                    {i === 0 && canMeasure && (
                      <span className="shrink-0 rounded-md bg-[var(--color-green-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--color-green)]">
                        {t("いちばん近い")}
                      </span>
                    )}
                  </span>

                  {/* 行くかどうかを決める材料を1行に。徒歩の分数・滞在の目安・時間の制限。 */}
                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                    {walkMin !== null ? (
                      <span className="rounded-md bg-[var(--color-terracotta-soft)] px-1.5 py-0.5 font-bold text-[var(--color-terracotta)]">
                        {t("徒歩{n}分", { n: walkMin })}・{formatDistance(s.meters)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-ink-soft)]">{s.city ?? s.prefecture ?? ""}</span>
                    )}
                    <span className="text-[var(--color-ink-soft)]">
                      {t("滞在{n}分ほど", { n: stay })}
                    </span>
                  </span>

                  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                    {/* 断定できる時間だけを出し、推測したものには「（目安）」を添える。
                        色だけの○×にしないのは、確認していない時刻を信じさせないため。 */}
                    <span
                      className={`rounded-md px-1.5 py-0.5 font-bold ${
                        w.kind === "always"
                          ? "bg-[var(--color-green)] text-white"
                          : w.kind === "unknown"
                            ? "bg-[var(--color-panel-soft)] text-[var(--color-ink-soft)]"
                            : "bg-[var(--color-sun-soft)] text-[var(--color-sun-ink)]"
                      }`}
                    >
                      {t(w.label)}
                      {w.guessed ? t("（目安）") : ""}
                    </span>
                    {visited.has(s.id) && (
                      <span className="rounded-md bg-[var(--color-green)] px-1.5 py-0.5 font-bold text-white">{t("訪問済み")}</span>
                    )}
                    <span className="text-[var(--color-ink-soft)]">{s.designation}</span>
                  </span>

                  {/* タップすると何が起きるかを、言葉で書いておく。 */}
                  <span className="mt-1.5 flex items-center gap-1 text-[12px] font-bold text-[var(--color-terracotta)]">
                    <MicIcon size={13} />
                    {t("話を聞く")}
                  </span>
                </span>
                <ChevronLeftIcon
                  size={18}
                  className="shrink-0 rotate-180 text-[var(--color-ink-soft)]"
                />
              </button>
            </li>
            );
          })}
        </ul>
      </section>

      {/* <p> の中に <details> は置けない（HTMLとして不正で、表示が崩れる）。 */}
      <div className="mt-5 px-5 text-[12px] leading-relaxed text-[var(--color-ink-soft)]">
        {/* 出典は資料そのもの。日本語以外の画面では要約を訳して出し、
            原文（日本語）は開いたときだけ見せる（設定画面と同じ扱い）。 */}
        {t("各市の公式文化財一覧、文化庁の指定文化財データベース、自治体サイトなどをもとに選定し、座標は国土地理院の住所検索で照合しています。")}
        <details className="mt-1">
          <summary className="cursor-pointer font-bold">{t("出典の原文（日本語）")}</summary>
          <span lang="ja" className="mt-1 block">
            {DATA_SOURCE}
          </span>
        </details>
      </div>
    </div>
  );
}

/**
 * 見出しの飾り。舞い落ちるもみじと銀杏。
 *
 * 以前は花火だった（夏の夕暮れの絵）。季節を秋に替えたので、同じ位置・同じ
 * 大きさのまま絵柄だけ差し替えている。装飾なので aria-hidden、動きもなし
 * （歩きながら読む画面で、動くものが文字と競わないように）。
 */
function SeasonMotif() {
  // 位置・角度・大きさ・色を決め打ちにして、開くたびに散らばりが変わらないようにする。
  const leaves = [
    { x: 18, y: 26, r: -18, s: 1.15, kind: "maple", c: "var(--color-sunset)" },
    { x: 54, y: 14, r: 24, s: 0.85, kind: "ginkgo", c: "var(--color-sun)" },
    { x: 84, y: 40, r: -6, s: 1, kind: "maple", c: "var(--color-sun)" },
    { x: 38, y: 62, r: 40, s: 0.7, kind: "ginkgo", c: "var(--color-sunset)" },
    { x: 72, y: 78, r: -34, s: 0.9, kind: "maple", c: "var(--color-sunset)" },
    { x: 100, y: 66, r: 12, s: 0.75, kind: "ginkgo", c: "var(--color-sun)" },
  ];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 120"
      className="pointer-events-none absolute -right-6 -top-4 h-36 w-36 opacity-70"
    >
      {leaves.map((l, i) => (
        <g key={i} transform={`translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})`}>
          {l.kind === "maple" ? (
            /* もみじ: 五つの切れ込みを持つ星形を、単純化して描く。 */
            <path
              d="M0 -9 L2.6 -3.4 L8.6 -5.2 L5 -0.4 L9.6 2.6 L3.4 3 L4.2 8.8 L0 4.8 L-4.2 8.8 L-3.4 3 L-9.6 2.6 L-5 -0.4 L-8.6 -5.2 L-2.6 -3.4 Z"
              fill={l.c}
              opacity="0.9"
            />
          ) : (
            /* いちょう: 扇形と軸。 */
            <>
              <path d="M0 4 C-7 4 -8.5 -2 0 -8 C8.5 -2 7 4 0 4 Z" fill={l.c} opacity="0.9" />
              <line x1="0" y1="4" x2="0" y2="8.5" stroke={l.c} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}

function Stat({
  value,
  unit,
  label,
}: {
  value: number;
  unit: string;
  label: string;
}) {
  return (
    <div
      /* A white tint over the green header left white text at 3.7:1 — the
         headline numbers were the least legible text on the screen. Tinting
         the tile darker instead of lighter takes the same design to 6.3:1. */
      className="flex-1 rounded-xl bg-black/15 px-2.5 py-2 text-center"
    >
      <div className="text-[12px] font-medium text-white/90">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold leading-none">
        {value}
        <span className="ml-0.5 text-[12px] font-bold text-white/90">{unit}</span>
      </div>
    </div>
  );
}
