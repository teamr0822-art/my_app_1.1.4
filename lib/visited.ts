"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * 訪れた場所の記録。
 *
 * 観光アプリが二度目に開かれる理由は、たいてい「記録が残っていること」です。
 * 到着を自動で拾って印を付けるだけなので、利用者は何も操作しません。
 *
 * 端末のみに保存します（アカウントもサーバーもない）。消したいときは
 * 設定から消せます。
 */

const KEY = "yorimikke-visited-v1";

type VisitedMap = Record<string, number>; // spotId → 最初に訪れた時刻

let cache: VisitedMap | null = null;
const listeners = new Set<() => void>();

function read(): VisitedMap {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as VisitedMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function write(next: VisitedMap) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 保存できなくても、その場の表示は正しいままにする */
  }
  for (const l of listeners) l();
}

export function markVisited(spotId: string) {
  const current = read();
  if (current[spotId]) return; // 初回だけ記録する
  write({ ...current, [spotId]: Date.now() });
}

export function clearVisited() {
  write({});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const EMPTY: VisitedMap = {};

export function useVisited() {
  const visited = useSyncExternalStore(
    subscribe,
    () => read(),
    () => EMPTY, // サーバー描画時は空。端末にしかない情報なので。
  );
  const has = useCallback((id: string) => Boolean(visited[id]), [visited]);
  return { visited, has, count: Object.keys(visited).length, markVisited, clearVisited };
}
