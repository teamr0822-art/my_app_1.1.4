"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { Nav } from "@/app/page";
import { SPOTS, STATS, KOCHI_CENTER, formatDistance } from "@/lib/spots";
import { useGeolocation } from "@/lib/use-geolocation";
import {
  useRouteDirections,
  formatDuration,
  type RouteStep,
} from "@/lib/use-route-directions";
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
  /** Which leg the visitor is walking. Leg 0 = current position → stop 1. */
  const [activeLeg, setActiveLeg] = useState(0);
  const [expanded, setExpanded] = useState(true);
  // Opening the itinerary AND the first leg's turn list at once buried the map
  // under the panel the moment guidance started. The stop list stays open (it
  // is the point of the screen); the street-by-street directions wait to be
  // asked for.
  const [openSteps, setOpenSteps] = useState<number | null>(null);

  const selected = SPOTS.find((s) => s.id === selectedId) ?? null;
  const routeSpots = useMemo(
    () =>
      routeIds
        .map((id) => SPOTS.find((s) => s.id === id))
        .filter((s): s is (typeof SPOTS)[number] => Boolean(s)),
    [routeIds],
  );

  const start = located ? pos : null;
  const { directions, loading, error } = useRouteDirections(
    start,
    routeSpots,
    routeTransport,
  );

  // A new itinerary starts from the beginning.
  useEffect(() => {
    setActiveLeg(0);
    setOpenSteps(0);
  }, [routeIds.join(",")]);

  const hasRoute = routeSpots.length > 0;
  const legs = directions?.legs ?? [];
  // Without a fix we cannot route from the visitor, so leg i leads to stop i+1.
  const stopForLeg = (index: number) => routeSpots[start ? index : index + 1];

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header className="z-[10] flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-5 pb-3 pt-[calc(16px+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-[16px] font-extrabold">
            {hasRoute ? "ルート案内" : "史跡マップ"}
          </h1>
          <p className="text-[11px] text-[var(--color-ink-soft)]">
            {hasRoute && directions
              ? `全${routeSpots.length}スポット・${formatDistance(directions.distance)}・${formatDuration(directions.duration)}（${routeTransport}）`
              : `${STATS.kunishitei + STATS.kenshitei}件の指定文化財のうち、音声ガイド対応${SPOTS.length}件`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          aria-label="凡例を表示"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel-soft)] text-[var(--color-ink-soft)]"
        >
          <InfoIcon size={18} />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <LeafletMap
          className="hh-map-full absolute inset-0 h-full w-full"
          center={located ? pos : KOCHI_CENTER}
          zoom={14}
          spots={SPOTS}
          userPos={located ? pos : null}
          activeId={selectedId}
          onSelect={setSelectedId}
          routeSpots={routeSpots}
          routeLegs={legs.length ? legs : undefined}
          activeLeg={activeLeg}
          snappedWaypoints={directions?.snapped}
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
            <ul className="space-y-1 text-[var(--color-ink-soft)]">
              <li>青い点が現在地、緑の丸がいま向かっているスポットです。</li>
              <li>白い矢印が進む向きを示しています。</li>
              <li>薄い線は通過済み、濃い線がこれから歩く道です。</li>
              {!located && <li>現在地が取得できないため高知城周辺を表示しています。</li>}
            </ul>
          </div>
        )}

        {/* Turn-by-turn itinerary */}
        {hasRoute && !selected && (
          <div className="absolute inset-x-2 bottom-20 z-[500]">
            <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl">
              <NextUp
                loading={loading}
                error={error}
                leg={legs[activeLeg]}
                target={stopForLeg(activeLeg)}
                index={activeLeg}
                total={routeSpots.length}
                expanded={expanded}
                onToggle={() => setExpanded((v) => !v)}
              />

              {expanded && (
                <div className="max-h-[38vh] overflow-y-auto border-t border-[var(--color-border)]">
                  <ol className="p-2">
                    {routeSpots.map((spot, i) => {
                      const legIndex = start ? i : i - 1;
                      const leg = legIndex >= 0 ? legs[legIndex] : undefined;
                      const state =
                        legIndex < activeLeg
                          ? "done"
                          : legIndex === activeLeg
                            ? "current"
                            : "upcoming";
                      return (
                        <li key={spot.id} className="relative pl-9">
                          <span
                            aria-hidden="true"
                            className="absolute left-3 top-8 bottom-0 w-px bg-[var(--color-border)]"
                          />
                          <span
                            aria-hidden="true"
                            className={`absolute left-0 top-3 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                              state === "current"
                                ? "bg-[var(--color-green)] ring-4 ring-[var(--color-green)]/25"
                                : state === "done"
                                  ? "bg-[#b9ada0]"
                                  : "bg-[var(--color-terracotta)]"
                            }`}
                          >
                            {i + 1}
                          </span>

                          <div className="py-2 pr-1">
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                onClick={() => nav.openSpot(spot.id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="block truncate text-[14px] font-bold">
                                  {spot.name}
                                </span>
                                <span className="block truncate text-[11px] text-[var(--color-ink-soft)]">
                                  {leg
                                    ? `${i === 0 && start ? "現在地" : "前の地点"}から ${formatDistance(leg.distance)}・${formatDuration(leg.duration)}`
                                    : spot.designation}
                                </span>
                              </button>
                              <span aria-hidden="true" className="text-xl leading-none">
                                {spot.icon}
                              </span>
                            </div>

                            {leg && leg.steps.length > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenSteps(openSteps === legIndex ? null : legIndex)
                                  }
                                  className="mt-1 text-[11px] font-bold text-[var(--color-terracotta)]"
                                >
                                  {openSteps === legIndex
                                    ? "道順を閉じる"
                                    : `道順を見る（${leg.steps.length}手順）`}
                                </button>
                                {openSteps === legIndex && (
                                  <ul className="mt-2 space-y-2 rounded-2xl bg-[var(--color-panel-soft)] p-3">
                                    {leg.steps.map((step, k) => (
                                      <li key={k} className="flex items-start gap-2">
                                        <TurnGlyph step={step} />
                                        <span className="min-w-0 flex-1 text-[12px] leading-5">
                                          {step.text}
                                          {step.distance > 5 && (
                                            <span className="text-[var(--color-ink-soft)]">
                                              {" "}
                                              （{formatDistance(step.distance)}）
                                            </span>
                                          )}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </>
                            )}

                            {state === "current" && (
                              <div className="mt-2 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => nav.openSpot(spot.id)}
                                  className="flex-1 rounded-xl bg-[var(--color-terracotta)] py-2 text-[12px] font-bold text-white"
                                >
                                  音声ガイドを聞く
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Math.min(
                                      activeLeg + 1,
                                      Math.max(0, routeSpots.length - 1),
                                    );
                                    setActiveLeg(next);
                                    setOpenSteps(next);
                                  }}
                                  className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-[12px] font-bold"
                                >
                                  到着した
                                </button>
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          </div>
        )}

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

/** The banner at the top of the sheet: what to do right now. */
function NextUp({
  loading,
  error,
  leg,
  target,
  index,
  total,
  expanded,
  onToggle,
}: {
  loading: boolean;
  error: string | null;
  leg?: { distance: number; duration: number; steps: RouteStep[] };
  target?: { name: string };
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = leg?.steps?.[0];
  return (
    <button type="button" onClick={onToggle} className="w-full px-4 py-3 text-left">
      <div className="flex items-center gap-3">
        {first ? (
          <TurnGlyph step={first} large />
        ) : (
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-panel-soft)] text-lg">
            🚶
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold tracking-wide text-[var(--color-terracotta)]">
            次の目的地（{Math.min(index + 1, total)}/{total}）
          </p>
          <p className="truncate text-[15px] font-extrabold">
            {target?.name ?? "ルート"}
          </p>
          <p className="truncate text-[11px] text-[var(--color-ink-soft)]">
            {loading
              ? "道順を調べています…"
              : error
                ? "道順を取得できませんでした。直線で順路だけ表示しています。"
                : leg
                  ? `${formatDistance(leg.distance)}・${formatDuration(leg.duration)}${first ? `／${first.text}` : ""}`
                  : "現在地が取得できると、ここから道順を案内します。"}
          </p>
        </div>
        <span className="text-[11px] text-[var(--color-ink-soft)]">
          {expanded ? "閉じる" : "開く"}
        </span>
      </div>
    </button>
  );
}

/** Arrow pictogram matching an OSRM maneuver. */
function TurnGlyph({ step, large = false }: { step: RouteStep; large?: boolean }) {
  const rotation: Record<string, number> = {
    start: 0,
    straight: 0,
    "slight-right": 45,
    right: 90,
    "sharp-right": 135,
    uturn: 180,
    "sharp-left": -135,
    left: -90,
    "slight-left": -45,
    arrive: 0,
  };
  const size = large ? "h-11 w-11 text-[20px]" : "h-6 w-6 text-[13px]";
  const glyph = step.icon === "arrive" ? "📍" : step.icon === "start" ? "🚶" : "➜";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-${large ? "2xl" : "lg"} bg-[var(--color-panel-soft)] ${size}`}
    >
      <span
        style={{
          display: "inline-block",
          transform: `rotate(${(rotation[step.icon] ?? 0) - (glyph === "➜" ? 90 : 0)}deg)`,
        }}
      >
        {glyph}
      </span>
    </span>
  );
}
