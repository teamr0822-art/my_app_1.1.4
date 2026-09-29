"use client";

import { useState } from "react";
import { useJourney, today } from "@/lib/journey";
import { useT } from "@/lib/i18n";

/**
 * 歩いた距離の記録（Android の健康アプリのような見え方）。
 *
 * 出すのは3つだけにする。
 *   1. きょうの距離（いちばん知りたい数字なので、文字を大きく）
 *   2. 直近7日の棒グラフ（増えた／減ったが一目で分かる）
 *   3. 今月のカレンダー（歩いた日ほど濃い緑。歩かなかった日は空白）
 *
 * ■ 色の使い方
 * 系列は1つなので凡例は置かない。カレンダーは「量」を表すので、緑1色の
 * 濃さ4段階（明→暗）だけで表す。数字は色ではなく文字の色で読ませる。
 * 棒は全部同じ緑、きょうだけ枠を付けて位置を示す（色だけに頼らない）。
 */

/** 量の段階。緑1色の明るさだけで4段階（カレンダーの塗り分け）。 */
const STEPS = ["#e8eed7", "#b9c99a", "#85a05f", "#587136"];
/** 段階の境目（m）。1km 以上でいちばん濃い。 */
const BREAKS = [200, 1000, 3000];

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

function fmt(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stepOf(meters: number): number {
  if (meters <= 0) return -1;
  if (meters < BREAKS[0]) return 0;
  if (meters < BREAKS[1]) return 1;
  if (meters < BREAKS[2]) return 2;
  return 3;
}

export function JourneyCard() {
  const t = useT();
  const journey = useJourney();
  /** タップした日。もう一度押すと閉じる（狭い画面なので常設の吹き出しは置かない）。 */
  const [picked, setPicked] = useState<string | null>(null);
  const now = new Date();
  const todayKey = today();

  // 直近7日（左が6日前、右がきょう）。
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return { key: dayKey(d), weekday: WEEK[d.getDay()], date: d.getDate() };
  });
  const values = week.map((d) => journey.byDay[d.key] ?? 0);
  const peak = Math.max(...values, 1);

  // 今月のカレンダー。1日の曜日ぶんだけ先頭を空ける。
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const cells: ({ key: string; date: number } | null)[] = [
    ...Array.from({ length: first.getDay() }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), i + 1);
      return { key: dayKey(d), date: i + 1 };
    }),
  ];

  const pickedMeters = picked ? (journey.byDay[picked] ?? 0) : null;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      {/* 1. きょうの距離 */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-[var(--color-ink-soft)]">{t("きょう歩いた距離")}</p>
          <p className="mt-0.5 text-[30px] font-extrabold leading-none tracking-tight">
            {fmt(journey.todayMeters)}
          </p>
        </div>
        <dl className="text-right text-[12px] leading-5 text-[var(--color-ink-soft)]">
          <div className="flex justify-end gap-1.5">
            <dt>{t("7日間")}</dt>
            <dd className="font-bold text-[var(--color-ink)]">{fmt(journey.weekMeters)}</dd>
          </div>
          <div className="flex justify-end gap-1.5">
            <dt>{t("通算")}</dt>
            <dd className="font-bold text-[var(--color-ink)]">{fmt(journey.totalMeters)}</dd>
          </div>
        </dl>
      </div>

      {/* 2. 直近7日の棒グラフ。棒をタップするとその日の距離が下に出る。 */}
      <div className="mt-4 flex h-[84px] items-end gap-1.5" role="group" aria-label={t("直近7日の歩いた距離")}>
        {week.map((d, i) => {
          const meters = values[i];
          const isToday = d.key === todayKey;
          const height = meters > 0 ? Math.max(4, Math.round((meters / peak) * 72)) : 2;
          return (
            <button
              key={d.key}
              type="button"
              onClick={() => setPicked((p) => (p === d.key ? null : d.key))}
              aria-label={`${d.date}日（${d.weekday}）${fmt(meters)}`}
              aria-pressed={picked === d.key}
              className="flex min-h-11 flex-1 flex-col items-center justify-end gap-1"
            >
              <span
                aria-hidden="true"
                style={{ height, background: meters > 0 ? STEPS[3] : "var(--color-border)" }}
                className={`w-full rounded-t ${
                  isToday ? "outline outline-2 outline-offset-1 outline-[var(--color-terracotta)]" : ""
                } ${picked === d.key ? "opacity-70" : ""}`}
              />
              <span className={`text-[11px] ${isToday ? "font-extrabold text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]"}`}>
                {d.weekday}
              </span>
            </button>
          );
        })}
      </div>

      {/* 3. 今月のカレンダー。歩いた日ほど濃い。 */}
      <p className="mt-4 text-[12px] font-bold text-[var(--color-ink-soft)]">
        {now.getMonth() + 1}月の記録
      </p>
      <div className="mt-2 grid grid-cols-7 gap-1" role="grid" aria-label={`${now.getMonth() + 1}月の歩いた距離`}>
        {WEEK.map((w) => (
          <span key={w} aria-hidden="true" className="text-center text-[10px] text-[var(--color-ink-soft)]">
            {w}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <span key={`pad-${i}`} aria-hidden="true" />;
          const meters = journey.byDay[cell.key] ?? 0;
          const step = stepOf(meters);
          const isToday = cell.key === todayKey;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => setPicked((p) => (p === cell.key ? null : cell.key))}
              aria-label={`${cell.date}日 ${fmt(meters)}`}
              aria-pressed={picked === cell.key}
              style={{ background: step < 0 ? "var(--color-panel-soft)" : STEPS[step] }}
              className={`flex aspect-square items-center justify-center rounded-md text-[11px] font-bold ${
                step >= 2 ? "text-white" : "text-[var(--color-ink-soft)]"
              } ${isToday ? "ring-2 ring-[var(--color-terracotta)]" : ""} ${
                picked === cell.key ? "ring-2 ring-[var(--color-ink)]" : ""
              }`}
            >
              {cell.date}
            </button>
          );
        })}
      </div>

      {/* 目盛りの説明。色の濃さが何を意味するかを言葉でも置く。 */}
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-[var(--color-ink-soft)]">
        <span>{t("少ない")}</span>
        {STEPS.map((c) => (
          <span key={c} aria-hidden="true" style={{ background: c }} className="h-3 w-3 rounded-sm" />
        ))}
        <span>{t("多い（3km以上）")}</span>
      </div>

      <p aria-live="polite" className="mt-2 min-h-5 text-[12px] text-[var(--color-ink-soft)]">
        {picked
          ? `${Number(picked.slice(5, 7))}月${Number(picked.slice(8, 10))}日：${fmt(pickedMeters ?? 0)}`
          : "棒や日付をタップすると、その日の距離が出ます。"}
      </p>

      <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-soft)]">{t("アプリを開いている間の移動だけを、この端末に記録します（どこにも送りません）。 10m未満の動きは測位の揺れとして数えません。")}</p>
    </div>
  );
}
