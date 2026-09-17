"use client";

import { useEffect, useState } from "react";

/**
 * Service Worker の登録と、オフライン時の告知。
 *
 * 圏外になったこと自体は防げないので、せめて「いま何ができないか」を言う。
 * スポットの一覧と地図（見たことのある範囲）は動き、AI とルート探索だけが
 * 止まる、という状態を正確に伝えるのが目的。
 */
export function OfflineStatus() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // 登録に失敗してもアプリは普通に動く（オフライン対応がないだけ）。
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[900] bg-[var(--color-sunset-ink)] px-4 py-2 text-center text-[13px] font-bold text-white"
      style={{ paddingTop: "calc(8px + env(safe-area-inset-top))" }}
    >
      オフラインです。スポットの情報と地図は見られますが、AIの案内と経路の計算はできません。
    </div>
  );
}
