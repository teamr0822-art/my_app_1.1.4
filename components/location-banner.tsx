"use client";

import { useState } from "react";
import { AREAS } from "@/lib/spots";
import { useLocation } from "@/lib/location-context";

/**
 * 「いまどこを基準にしているか」を必ず言う帯。
 *
 * 位置情報が取れていないのに距離を出すのが、このアプリで一番危ない挙動だった。
 * 取れていないときは、それを隠さずに出し、その場で街を選べるようにする。
 * 正常に測位できているときは何も出さない（普段は黙っている）。
 */
export function LocationBanner() {
  const geo = useLocation();
  const [picking, setPicking] = useState(false);

  if (geo.status === "ok" && !geo.manualArea) return null;

  const message =
    geo.manualArea !== null
      ? `「${geo.manualArea}」を基準に表示しています`
      : geo.status === "denied"
        ? "位置情報が許可されていないため、現在地からの距離は表示できません"
        : geo.status === "unsupported"
          ? "この端末では位置情報を使えません"
          : geo.status === "coarse"
            ? `現在地の精度が粗いため（誤差およそ${Math.round((geo.accuracy ?? 0) / 10) * 10}m）、距離は表示していません`
            : geo.status === "locating"
              ? "現在地を確認しています…"
              : "現在地を取得できませんでした";

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-[var(--color-border)] bg-[var(--color-sun-soft)] px-4 py-2 text-[13px] leading-relaxed text-[var(--color-ink)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">{message}</span>
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          className="min-h-11 font-bold text-[var(--color-terracotta)] underline"
        >
          {geo.manualArea ? "街を変える" : "いる街を選ぶ"}
        </button>
        {geo.manualArea && (
          <button
            type="button"
            onClick={() => {
              geo.setManualArea(null);
              geo.retry();
            }}
            className="min-h-11 font-bold text-[var(--color-terracotta)] underline"
          >
            現在地に戻す
          </button>
        )}
        {!geo.manualArea && (geo.status === "denied" || geo.status === "error") && (
          <button
            type="button"
            onClick={geo.retry}
            className="min-h-11 font-bold text-[var(--color-terracotta)] underline"
          >
            もう一度試す
          </button>
        )}
      </div>

      {picking && (
        <div role="radiogroup" aria-label="いる街" className="mt-2 flex flex-wrap gap-2">
          {AREAS.map((area) => {
            const on = geo.manualArea === area;
            return (
              <button
                key={area}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  geo.setManualArea(area);
                  setPicking(false);
                }}
                className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-bold ${
                  on
                    ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white"
                    : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-ink)]"
                }`}
              >
                {area}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
