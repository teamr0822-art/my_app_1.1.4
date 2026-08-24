"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { Nav } from "@/app/page";
import { SPOTS, STATS, KOCHI_CENTER, distanceMeters, formatDistance } from "@/lib/spots";
import { useGeolocation } from "@/lib/use-geolocation";
import { InfoIcon, CloseIcon } from "@/components/icons";

const LeafletMap = dynamic(
  () => import("@/components/leaflet-map").then((m) => m.LeafletMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#e8eadf] text-[13px] text-[var(--color-ink-soft)]">
        地図を読み込んでいます…
      </div>
    ),
  },
);

export function MapScreen({
  nav,
  routeIds = [],
  routeTransport = "徒歩",
}: {
  nav: Nav;
  routeIds?: string[];
  routeTransport?: string;
}) {
  const { pos, located } = useGeolocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showRoute, setShowRoute] = useState(true);

  const selected = SPOTS.find((s) => s.id === selectedId) ?? null;
  const routeSpots = routeIds.map((id) => SPOTS.find((s) => s.id === id)).filter((s): s is typeof SPOTS[number] => Boolean(s));

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <header className="z-[10] flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-5 pb-3 pt-[calc(16px+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-[16px] font-extrabold">史跡マップ</h1>
          <p className="text-[11px] text-[var(--color-ink-soft)]">
            {STATS.kunishitei + STATS.kenshitei}件の指定文化財のうち、音声ガイド対応
            {SPOTS.length}件
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="凡例を表示"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-ink-soft)]"
        >
          <InfoIcon size={18} />
        </button>
      </header>

      {/* Map */}
      <div className="relative min-h-0 flex-1">
        <LeafletMap
          className="absolute inset-0 h-full w-full"
          center={located ? pos : KOCHI_CENTER}
          zoom={14}
          spots={SPOTS}
          userPos={located ? pos : null}
          activeId={selectedId}
          onSelect={setSelectedId}
          routeSpots={routeSpots}
          routeTransport={routeTransport}
        />

        {showInfo && (
          <div className="absolute left-4 right-4 top-4 z-[500] rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)]/95 p-3 text-[12px] leading-relaxed shadow-lg backdrop-blur">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-bold">凡例</span>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                aria-label="閉じる"
                className="text-[var(--color-ink-soft)]"
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <p className="text-[var(--color-ink-soft)]">
              ピンをタップすると詳細が開きます。青い点はあなたの現在地です。
              {!located && "（現在地が取得できないため高知城周辺を表示しています）"}
            </p>
          </div>
        )}

        {/* Itinerary: the stops in order, like a directions list. */}
        {routeSpots.length > 1 && !selected && (
          <div className="absolute inset-x-3 bottom-24 z-[500]">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl">
              <button
                type="button"
                onClick={() => setShowRoute((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3"
              >
                <span className="text-[13px] font-bold">
                  ルート案内・{routeSpots.length}スポット（{routeTransport}）
                </span>
                <span className="text-[11px] text-[var(--color-ink-soft)]">
                  {showRoute ? "閉じる" : "開く"}
                </span>
              </button>

              {showRoute && (
                <ol className="max-h-56 overflow-y-auto border-t border-[var(--color-border)] px-2 pb-2">
                  {routeSpots.map((spot, index) => {
                    const previous = index === 0 ? (located ? pos : null) : ([routeSpots[index - 1].lat, routeSpots[index - 1].lng] as [number, number]);
                    const leg = previous ? distanceMeters(previous, [spot.lat, spot.lng]) : null;
                    return (
                      <li key={spot.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(spot.id);
                            nav.openSpot(spot.id);
                          }}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-[var(--color-panel-soft)]"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-terracotta)] text-[12px] font-bold text-white"
                          >
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold">{spot.name}</span>
                            <span className="block truncate text-[11px] text-[var(--color-ink-soft)]">
                              {leg !== null
                                ? `${index === 0 ? "現在地" : "前の地点"}から約${formatDistance(leg)}`
                                : spot.designation}
                            </span>
                          </span>
                          <span aria-hidden="true" className="text-lg">{spot.icon}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
        )}

        {/* Selected spot card */}
        {selected && (
          <div className="anim-sheet absolute inset-x-3 bottom-24 z-[500]">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-3 shadow-xl">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-panel-soft)] text-2xl"
                >
                  {selected.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold">{selected.name}</p>
                  <p className="text-[11px] text-[var(--color-ink-soft)]">
                    {selected.designation}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="閉じる"
                  className="text-[var(--color-ink-soft)]"
                >
                  <CloseIcon size={18} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => nav.openSpot(selected.id)}
                className="mt-3 w-full rounded-xl bg-[var(--color-terracotta)] py-2.5 text-[13px] font-bold text-white active:scale-[0.99]"
              >
                このスポットで案内をはじめる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
