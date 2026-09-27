"use client";

import { useSyncExternalStore } from "react";

/**
 * 歩いた距離の記録。
 *
 * 測位が更新されるたびに、前の地点からの距離を足していく。ただし GPS は
 * 止まっていても数十メートル飛ぶので、そのまま足すと座っているだけで
 * 「1km 歩いた」ことになってしまう。ここでは次の条件を満たした移動だけを数える。
 *
 *   - 精度が 50m 以内（ビルの谷間の粗い測位は捨てる）
 *   - 前の地点から 10m 以上（それ未満は GPS の揺れとみなす）
 *   - その移動の速さが 33m/秒（約120km/h）以下（明らかな飛びを捨てる）
 *   - 前の測位から 5分以内（アプリを閉じていた間の移動は数えない）
 *
 * 保存は端末の localStorage だけ。日ごとの合計を30日分と、通算を持つ。
 *
 * ■ ログインした人だけの機能
 * 記録を取るのはログインしている間だけ。ログインしていない人にとっては
 * 「勝手に記録されている」ほうが気になるし、あとでアカウントに引き継ぐ前提の
 * 数字でもあるため。setJourneyEnabled() で切り替える（app/page.tsx が呼ぶ）。
 */

const KEY = "yorimikke-journey-v1";

/** これ未満の移動は GPS の揺れとして数えない（m）。 */
const MIN_STEP_M = 10;
/** これを超える移動は測位の飛びとして数えない（m/秒）。 */
const MAX_SPEED_MS = 33;
/** これ以上あいだが空いたら、続きではなく新しい移動とみなす（ミリ秒）。 */
const MAX_GAP_MS = 5 * 60 * 1000;
/** 精度がこれより悪い測位は使わない（m）。 */
const MAX_ACCURACY_M = 50;
/** 日ごとの記録を残す日数。 */
const KEEP_DAYS = 30;

export type Journey = {
  /** 通算の距離（m）。 */
  totalMeters: number;
  /** 日付（YYYY-MM-DD、端末の時計）ごとの距離（m）。 */
  byDay: Record<string, number>;
  /** いちばん長く歩いた日の距離（m）。 */
  bestDayMeters: number;
  updatedAt: number;
};

const EMPTY: Journey = { totalMeters: 0, byDay: {}, bestDayMeters: 0, updatedAt: 0 };

let cache: Journey | null = null;
const listeners = new Set<() => void>();
/** 直前に採用した地点。保存はしない（アプリを開き直したら続きにしない）。 */
let last: { pos: [number, number]; at: number } | null = null;
/** 記録してよいか（ログイン中だけ true）。 */
let enabled = false;

/** ログイン状態に合わせて記録のオン／オフを切り替える。 */
export function setJourneyEnabled(on: boolean) {
  if (enabled === on) return;
  enabled = on;
  // 切り替えの前後をまたいで距離を足さない（ログイン直後に、直前にいた場所
  // からの距離がいきなり加算されるのを防ぐ）。
  last = null;
  for (const l of listeners) l();
}

export function isJourneyEnabled(): boolean {
  return enabled;
}

function read(): Journey {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Journey>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Journey) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 保存できなくても、その場の表示は正しいままにする */
  }
  for (const l of listeners) l();
}

/** 端末の時計での「きょう」。UTC にすると朝9時までが前日になってしまう。 */
export function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 平面近似の距離（m）。数百メートルの区間ではこれで十分。 */
function metres(a: [number, number], b: [number, number]): number {
  const lat = (b[0] - a[0]) * 111320;
  const lng = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(lat, lng);
}

/**
 * 測位を1つ受け取り、条件を満たせば距離に足す。
 * 足したときだけ true を返す（テストと動作確認のため）。
 */
export function recordPosition(
  pos: [number, number],
  accuracy: number | null,
  at: number = Date.now(),
): boolean {
  if (!enabled) return false;
  if (accuracy !== null && accuracy > MAX_ACCURACY_M) return false;

  const previous = last;
  last = { pos, at };
  if (!previous) return false;

  const gap = at - previous.at;
  if (gap <= 0 || gap > MAX_GAP_MS) return false;

  const step = metres(previous.pos, pos);
  if (step < MIN_STEP_M) {
    // 揺れの範囲。次回のために前の地点は残したままにする（少しずつ進む歩行を
    // 取りこぼさないよう、基準点は更新しない）。
    last = previous;
    return false;
  }
  if (step / (gap / 1000) > MAX_SPEED_MS) return false;

  const current = read();
  const day = today();
  const byDay = { ...current.byDay, [day]: (current.byDay[day] ?? 0) + step };
  // 30日より古い日は落とす（端末の保存領域を無駄に使わない）。
  const days = Object.keys(byDay).sort();
  for (const old of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete byDay[old];

  write({
    totalMeters: current.totalMeters + step,
    byDay,
    bestDayMeters: Math.max(current.bestDayMeters, byDay[day]),
    updatedAt: at,
  });
  return true;
}

export function clearJourney() {
  last = null;
  write({ ...EMPTY, updatedAt: Date.now() });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useJourney() {
  const journey = useSyncExternalStore(
    subscribe,
    () => read(),
    () => EMPTY, // サーバー描画時は空。端末にしかない情報なので。
  );
  const day = today();
  return {
    ...journey,
    todayMeters: journey.byDay[day] ?? 0,
    /** 直近7日（きょうを含む）の合計。 */
    weekMeters: Object.entries(journey.byDay)
      .filter(([d]) => d > shiftDay(day, -7))
      .reduce((sum, [, m]) => sum + m, 0),
    clearJourney,
  };
}

/** YYYY-MM-DD を日数分ずらす。 */
function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
