"use client";

import { useState } from "react";
import { AREAS } from "@/lib/spots";
import { useLocation } from "@/lib/location-context";
import { useT } from "@/lib/i18n";

/**
 * 「いまどこを基準にしているか」を必ず言う帯。
 *
 * 位置情報が取れていないのに距離を出すのが、このアプリで一番危ない挙動だった。
 * 取れていないときは、それを隠さずに出し、その場で街を選べるようにする。
 * 正常に測位できているときは何も出さない（普段は黙っている）。
 */
export function LocationBanner() {
  const t = useT();
  const geo = useLocation();
  const [picking, setPicking] = useState(false);

  if (geo.status === "ok" && !geo.manualArea) return null;

  const message =
    geo.manualArea !== null
      ? t("「{area}」を基準に表示しています", { area: geo.manualArea })
      : geo.status === "denied"
        ? t("位置情報が許可されていないため、現在地からの距離は表示できません")
        : geo.status === "unsupported"
          ? t("この端末では位置情報を使えません")
          : geo.status === "coarse"
            ? t("現在地の精度が粗いため（誤差およそ{m}m）、距離は表示していません", {
                m: Math.round((geo.accuracy ?? 0) / 10) * 10,
              })
            : geo.status === "locating"
              ? t("現在地を確認しています…")
              : geo.status === "slow"
                ? t("現在地をまだ確認できていません。許可を求める表示が出ていれば「許可」を押してください")
                : t("現在地を取得できませんでした");

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-[var(--color-border)] bg-[var(--color-sun-soft)] px-4 py-2 text-[13px] leading-relaxed text-[var(--color-ink)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-bold">{message}</span>
        {/* 測位できていない間に何を表示しているのかも言う（既定は松江市）。 */}
        {!geo.manualArea && !geo.fix && geo.status !== "locating" && (
          <span className="text-[var(--color-ink-soft)]">
            {t("いまは{area}を表示しています", { area: geo.areaLabel })}
          </span>
        )}
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          aria-expanded={picking}
          className="min-h-11 font-bold text-[var(--color-terracotta)] underline"
        >
          {geo.manualArea ? t("街を変える") : t("いる街を選ぶ")}
        </button>
        {geo.manualArea && (
          <button
            type="button"
            onClick={() => {
              geo.setManualArea(null);
              geo.retry();
            }}
            className="min-h-11 font-bold text-[var(--color-terracotta)] underline"
          >{t("現在地に戻す")}</button>
        )}
        {!geo.manualArea &&
          (geo.status === "denied" || geo.status === "error" || geo.status === "slow") && (
          <button
            type="button"
            onClick={geo.retry}
            className="min-h-11 font-bold text-[var(--color-terracotta)] underline"
          >{t("もう一度試す")}</button>
        )}
      </div>

      {picking && (
        <div role="radiogroup" aria-label={t("いる街")} className="mt-2 flex flex-wrap gap-2">
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
