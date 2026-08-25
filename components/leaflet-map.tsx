"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, Map as LMap, Marker } from "leaflet";
import type { Spot } from "@/lib/spots";

type Props = {
  center: [number, number];
  zoom: number;
  spots: Spot[];
  userPos?: [number, number] | null;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  routeSpots?: Spot[];
  /** Per-leg geometry from the directions hook (leg 0 = current position → stop 1). */
  routeLegs?: { coords: [number, number][] }[];
  /** Index of the leg the visitor is currently walking. */
  activeLeg?: number;
};

/**
 * Leaflet map with OpenStreetMap tiles. Renders cultural-property markers with
 * their pictograph and, when available, the user's live position.
 */
export function LeafletMap({
  center,
  zoom,
  spots,
  userPos,
  activeId,
  onSelect,
  className,
  routeSpots = [],
  routeLegs,
  activeLeg = 0,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const routeLayerRef = useRef<LayerGroup | null>(null);
  // The map is created inside an async effect, so the route effect can run
  // before mapRef is populated. This flag re-runs the route effect once the
  // map actually exists.
  const [mapReady, setMapReady] = useState(false);
  const [bearing, setBearing] = useState(0);
  const userMarkerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      // Adds real map rotation (two-finger twist on touch, bearing API here).
      // Imported for its side effects, after Leaflet itself.
      (window as unknown as { L?: unknown }).L = L;
      await import("leaflet-rotate");
      if (cancelled || !hostRef.current || mapRef.current) return;

      const map = L.map(hostRef.current, {
        zoomControl: false,
        attributionControl: true,
        // Rotation: two-finger twist on touch devices, setBearing() from the
        // compass control. Rural lanes are easier to follow facing the way
        // you walk.
        rotate: true,
        touchRotate: true,
        bearing: 0,
        maxZoom: 21,
      } as L.MapOptions).setView(center, zoom);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        // OSM has tiles up to z19; beyond that Leaflet upscales them so narrow
        // lanes can still be inspected close-up.
        maxNativeZoom: 19,
        maxZoom: 21,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

      map.on("rotate", () => setBearing(Math.round(map.getBearing?.() ?? 0)));

      mapRef.current = map;
      setMapReady(true);

      for (const s of spots) {
        const icon = L.divIcon({
          className: "",
          html: markerHtml(s.icon, s.id === activeId),
          iconSize: [40, 48],
          iconAnchor: [20, 46],
        });
        const marker = L.marker([s.lat, s.lng], { icon }).addTo(map);
        marker.on("click", () => onSelectRef.current?.(s.id));
        markersRef.current[s.id] = marker;
      }

      // The map is mounted inside a flex panel that can change size after
      // dynamic import resolution and screen transitions. Recalculate after
      // layout settles so Leaflet does not keep a zero-sized viewport.
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 250);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current = {};
        routeLayerRef.current = null;
        setMapReady(false);
        userMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw the itinerary: a white casing, one polyline per leg, direction
  // arrows along the leg being walked, and numbered stop badges.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;

      // The map is created by another async effect, so it may not exist yet.
      let map = mapRef.current;
      for (let attempt = 0; !map && attempt < 60; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (cancelled) return;
        map = mapRef.current;
      }
      if (cancelled || !map) return;

      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      if (!routeSpots.length) return;

      const layer = L.layerGroup().addTo(map);
      routeLayerRef.current = layer;

      const stopPoints = routeSpots.map((s) => [s.lat, s.lng] as [number, number]);
      const legs =
        routeLegs && routeLegs.length
          ? routeLegs
          : // Straight dashed fallback: still shows the order when routing fails.
            buildStraightLegs(userPos ?? null, stopPoints);

      const all: [number, number][] = legs.flatMap((leg) => leg.coords);
      const routed = Boolean(routeLegs && routeLegs.length);

      // White casing underneath makes the route readable over any map tile.
      if (all.length > 1) {
        L.polyline(all, { color: "#ffffff", weight: 10, opacity: 0.95 }).addTo(layer);
      }

      legs.forEach((leg, index) => {
        if (leg.coords.length < 2) return;
        const done = index < activeLeg;
        const current = index === activeLeg;
        L.polyline(leg.coords, {
          color: done ? "#b9ada0" : "#c96f4a",
          weight: current ? 7 : 4,
          opacity: done ? 0.55 : current ? 0.95 : 0.5,
          dashArray: routed ? undefined : "6 8",
        }).addTo(layer);
      });

      // Direction arrows on the leg being walked, so "which way" is obvious.
      const currentLeg = legs[activeLeg];
      if (currentLeg && currentLeg.coords.length > 3) {
        for (const [point, angle] of arrowsAlong(currentLeg.coords, 6)) {
          L.marker(point, {
            icon: L.divIcon({
              className: "",
              html: arrowHtml(angle),
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            }),
            interactive: false,
            zIndexOffset: 800,
          }).addTo(layer);
        }
      }

      // Start pin at the visitor's position.
      if (userPos) {
        L.marker(userPos, {
          icon: L.divIcon({
            className: "",
            html: startBadgeHtml(),
            iconSize: [46, 22],
            iconAnchor: [23, 30],
          }),
          interactive: false,
          zIndexOffset: 1100,
        }).addTo(layer);
      }

      routeSpots.forEach((s, index) => {
        L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            className: "",
            html: stopBadgeHtml(index + 1, index === activeLeg),
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          zIndexOffset: 1000,
        })
          .addTo(layer)
          .on("click", () => onSelectRef.current?.(s.id));
      });

      const bounds = L.latLngBounds(all.length > 1 ? all : stopPoints);
      if (userPos) bounds.extend(userPos);
      map.fitBounds(bounds, { padding: [56, 56] });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapReady,
    routeSpots.map((s) => s.id).join(","),
    routeLegs,
    activeLeg,
    userPos?.join(","),
  ]);

  // Update user marker.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (cancelled || !map || !userPos) return;
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(userPos);
      } else {
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:18px;height:18px;border-radius:999px;background:#2b6cff;border:3px solid #fff;box-shadow:0 0 0 3px rgba(43,108,255,.3)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        userMarkerRef.current = L.marker(userPos, { icon }).addTo(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapReady, userPos]);

  const withMap = (fn: (map: LMap) => void) => () => {
    if (mapRef.current) fn(mapRef.current);
  };

  const rotateBy = (delta: number) =>
    withMap((map) => {
      const next = ((map.getBearing?.() ?? 0) + delta + 360) % 360;
      map.setBearing?.(next);
      setBearing(Math.round(next));
    });

  const fitEverything = withMap(async (map) => {
    const L = (await import("leaflet")).default;
    const points: [number, number][] = routeSpots.map((s) => [s.lat, s.lng]);
    if (userPos) points.push(userPos);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [56, 56] });
  });

  return (
    <div className={`relative ${className ?? ""}`}>
      <div ref={hostRef} className="absolute inset-0 h-full w-full" />

      {/* Map controls. Rural lanes need close zoom and a way to face the
          direction you are walking. */}
      <div className="pointer-events-none absolute right-3 top-3 z-[600] flex flex-col items-end gap-2">
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/95 shadow-lg backdrop-blur">
          <MapButton label="拡大" onClick={withMap((m) => m.zoomIn())}>
            <span className="text-lg leading-none">＋</span>
          </MapButton>
          <span className="h-px bg-[var(--color-border)]" />
          <MapButton label="縮小" onClick={withMap((m) => m.zoomOut())}>
            <span className="text-lg leading-none">−</span>
          </MapButton>
        </div>

        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/95 shadow-lg backdrop-blur">
          <MapButton label="左に回転" onClick={rotateBy(-30)}>
            <span className="text-base leading-none">↺</span>
          </MapButton>
          <span className="h-px bg-[var(--color-border)]" />
          <MapButton
            label={bearing ? "北を上に戻す" : "北が上です"}
            onClick={withMap((m) => {
              m.setBearing?.(0);
              setBearing(0);
            })}
          >
            <CompassGlyph bearing={bearing} />
          </MapButton>
          <span className="h-px bg-[var(--color-border)]" />
          <MapButton label="右に回転" onClick={rotateBy(30)}>
            <span className="text-base leading-none">↻</span>
          </MapButton>
        </div>

        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)]/95 shadow-lg backdrop-blur">
          <MapButton
            label="現在地へ"
            onClick={withMap((m) => {
              if (userPos) m.setView(userPos, Math.max(m.getZoom(), 17));
            })}
          >
            <span className="text-base leading-none">◎</span>
          </MapButton>
          {routeSpots.length > 0 && (
            <>
              <span className="h-px bg-[var(--color-border)]" />
              <MapButton label="ルート全体を表示" onClick={fitEverything}>
                <span className="text-[11px] font-bold leading-none">全体</span>
              </MapButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-10 w-10 items-center justify-center text-[var(--color-ink)] active:bg-[var(--color-panel-soft)]"
    >
      {children}
    </button>
  );
}

/** North-pointing needle that turns with the map. */
function CompassGlyph({ bearing }: { bearing: number }) {
  return (
    <span
      aria-hidden="true"
      className="block h-5 w-5"
      style={{ transform: `rotate(${-bearing}deg)` }}
    >
      <svg viewBox="0 0 20 20" width="20" height="20">
        <path d="M10 2 L13.4 11 L10 9 L6.6 11 Z" fill="#c96f4a" />
        <path d="M10 18 L6.6 11 L10 13 L13.4 11 Z" fill="#b9ada0" />
      </svg>
    </span>
  );
}

/** Straight-line legs used when the routing service is unavailable. */
function buildStraightLegs(
  userPos: [number, number] | null,
  stops: [number, number][],
): { coords: [number, number][] }[] {
  const points = userPos ? [userPos, ...stops] : stops;
  const legs: { coords: [number, number][] }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    legs.push({ coords: [points[i], points[i + 1]] });
  }
  return legs;
}

/** Evenly spaced points along a path, with the bearing at each one. */
function arrowsAlong(
  coords: [number, number][],
  count: number,
): [[number, number], number][] {
  const out: [[number, number], number][] = [];
  const step = Math.max(1, Math.floor(coords.length / (count + 1)));
  for (let i = step; i < coords.length - 1; i += step) {
    const [lat1, lng1] = coords[i];
    const [lat2, lng2] = coords[Math.min(i + 1, coords.length - 1)];
    const angle = (Math.atan2(lng2 - lng1, lat2 - lat1) * 180) / Math.PI;
    out.push([coords[i], angle]);
  }
  return out;
}

function arrowHtml(angle: number): string {
  return `<div style="transform:rotate(${angle}deg);display:flex;align-items:center;justify-content:center;width:22px;height:22px">
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1 L13 12 L8 9.4 L3 12 Z" fill="#ffffff" stroke="#8a4a2c" stroke-width="1.2" stroke-linejoin="round"/>
    </svg></div>`;
}

function startBadgeHtml(): string {
  return `<div style="padding:2px 8px;border-radius:999px;background:#2b6cff;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);font:700 11px/1.6 system-ui,sans-serif;white-space:nowrap">現在地</div>`;
}

/** Numbered badge marking a stop's position in the itinerary. */
function stopBadgeHtml(order: number, active: boolean): string {
  const bg = active ? "#2f7d4f" : "#c96f4a";
  const ring = active ? "3px solid #fff" : "2px solid #fff";
  const size = active ? 30 : 26;
  const glow = active ? "0 0 0 4px rgba(47,125,79,.28)," : "";
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};color:#fff;border:${ring};box-shadow:${glow}0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui,sans-serif">${order}</div>`;
}

function markerHtml(glyph: string, active: boolean): string {
  const bg = active ? "#c96f4a" : "#fbf8f2";
  const fg = active ? "#fff" : "#332a20";
  const ring = active ? "#c96f4a" : "#e4dccc";
  return `<div style="display:flex;flex-direction:column;align-items:center;">
    <div style="width:40px;height:40px;border-radius:999px;background:${bg};border:2px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 10px rgba(0,0,0,.2);color:${fg}">${glyph}</div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${bg};margin-top:-2px;"></div>
  </div>`;
}
