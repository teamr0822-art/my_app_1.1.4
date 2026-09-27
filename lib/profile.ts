"use client";

import { useSyncExternalStore } from "react";

/**
 * ニックネーム。
 *
 * ログインしなくても名前を付けられるようにしておく。ログイン機能をつないだ
 * あとは「その端末の名前」をそのままアカウントの表示名に引き継げばよく、
 * 先に作っておいても無駄にならない。
 *
 * 端末の localStorage にだけ保存する（サーバーには送らない）。
 */

const KEY = "yorimikke-profile-v1";

export type Profile = {
  nickname: string;
  /** 付けた／変えた時刻。あとでアカウントと同期するとき、どちらが新しいかの判断に使う。 */
  updatedAt: number;
};

const EMPTY: Profile = { nickname: "", updatedAt: 0 };

let cache: Profile | null = null;
const listeners = new Set<() => void>();

function read(): Profile {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Profile>) } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(next: Profile) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 保存できなくても、その場の表示は正しいままにする */
  }
  for (const l of listeners) l();
}

/** 30文字まで、前後の空白は落とす。空文字なら「未設定」に戻す。 */
export function setNickname(name: string) {
  write({ nickname: name.trim().slice(0, 30), updatedAt: Date.now() });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useProfile() {
  const profile = useSyncExternalStore(
    subscribe,
    () => read(),
    () => EMPTY, // サーバー描画時は空。端末にしかない情報なので。
  );
  return { ...profile, setNickname };
}
