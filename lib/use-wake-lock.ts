"use client";

import { useEffect } from "react";

/**
 * 案内している間だけ画面を消させない。
 *
 * 歩いていると数十秒で画面が暗転し、点け直すたびに測位からやり直しになる。
 * カーナビが画面を保つのと同じ理由で、案内中だけ Screen Wake Lock を取る。
 * 案内していない間は解放するので、電池には効かない。
 *
 * 対応していないブラウザ（iOS Safari の古い版など）では黙って何もしない。
 * 画面をバックグラウンドに送るとロックは自動で外れるため、戻ってきたときに
 * 取り直す。
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // 電池残量が少ないときなどは拒否される。案内自体は続ける。
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
      sentinel = null;
    };
  }, [active]);
}

type WakeLockSentinelLike = { release: () => Promise<void> };
