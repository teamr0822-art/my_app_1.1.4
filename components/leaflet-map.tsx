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
  /** Router-snapped waypoints, used to join the road to the real site. */
  snappedWaypoints?: [number, number][];
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
  snappedWaypoints,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  /** Itinerary already framed once, so zooming by hand is not undone. */
  const fittedRouteRef = useRef<string | null>(null);
  // The map is created inside an async effect, so the route effect can run
  // before mapRef is populated. This flag re-runs the route effect once the
  // map actually exists.
  const [mapReady, setMapReady] = useState(false);
  /** Bumped on zoom so the arrows can be respaced for the new scale. */
  const [zoomTick, setZoomTick] = useState(0);
  const userMarkerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const userPosRef = useRef<[number, number] | null>(userPos ?? null);
  userPosRef.current = userPos ?? null;
  const routeSpotsRef = useRef<Spot[]>(routeSpots);
  routeSpotsRef.current = routeSpots;
  /** Set by the declutter effect; called by the map's zoom/move handlers. */
  const declutterRef = useRef<(() => void) | null>(null);

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      // NOTE: leaflet.css is imported once from app/globals.css, ahead of this
      // app's own .leaflet-* rules. Importing it again here injected a second
      // copy AFTER globals.css at runtime, so Leaflet's defaults won the
      // cascade and quietly undid the map's styling: the container fell back
      // to Leaflet grey (#ddd) instead of #e3e9d8, and `.leaflet-tile{filter:
      // inherit}` cancelled the tone filter that matches the tiles to the rest
      // of the app. Leave this import out.
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
        // The plugin's own compass button would duplicate ours.
        rotateControl: false,
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

      // Controls live inside Leaflet's own control pane: that keeps them
      // correctly placed whatever the surrounding layout does.
      const Controls = L.Control.extend({
        options: { position: "topright" as const },
        onAdd() {
          const wrap = L.DomUtil.create("div", "hh-map-controls");
          wrap.style.cssText =
            "display:flex;flex-direction:column;gap:8px;align-items:flex-end";
          L.DomEvent.disableClickPropagation(wrap);
          L.DomEvent.disableScrollPropagation(wrap);

          const group = () => {
            const g = L.DomUtil.create("div", "", wrap);
            g.style.cssText =
              "display:flex;flex-direction:column;overflow:hidden;border-radius:16px;border:1px solid rgba(0,0,0,.12);background:rgba(255,255,255,.95);box-shadow:0 2px 10px rgba(0,0,0,.18);backdrop-filter:blur(6px)";
            return g;
          };
          const button = (
            parent: HTMLElement,
            label: string,
            html: string,
            onClick: () => void,
          ) => {
            if (parent.childElementCount) {
              const line = L.DomUtil.create("span", "", parent);
              line.style.cssText = "height:1px;background:rgba(0,0,0,.10)";
            }
            const b = L.DomUtil.create("button", "", parent) as HTMLButtonElement;
            b.type = "button";
            b.setAttribute("aria-label", label);
            b.title = label;
            b.innerHTML = html;
            b.style.cssText =
              "width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:transparent;border:0;cursor:pointer;color:var(--color-ink);font-size:18px;line-height:1";
            L.DomEvent.on(b, "click", (e) => {
              L.DomEvent.stop(e);
              onClick();
            });
            return b;
          };

          const zoomGroup = group();
          button(zoomGroup, "拡大", "＋", () => map.zoomIn());
          button(zoomGroup, "縮小", "−", () => map.zoomOut());

          const rotateGroup = group();
          const spin = (delta: number) => {
            const next = (((map.getBearing?.() ?? 0) + delta) % 360 + 360) % 360;
            map.setBearing?.(next);
          };
          button(rotateGroup, "左に回転", "↺", () => spin(-30));
          const compass = button(
            rotateGroup,
            "北を上に戻す",
            compassSvg(),
            () => map.setBearing?.(0),
          );
          button(rotateGroup, "右に回転", "↻", () => spin(30));

          const viewGroup = group();
          button(viewGroup, "現在地へ", "◎", () => {
            const pos = userPosRef.current;
            if (pos) map.setView(pos, Math.max(map.getZoom(), 18));
          });
          button(viewGroup, "ルート全体を表示", "<span style=\"font-size:12px;font-weight:700\">全体</span>", () => {
            const points = routeSpotsRef.current.map(
              (s) => [s.lat, s.lng] as [number, number],
            );
            const pos = userPosRef.current;
            if (pos) points.push(pos);
            if (points.length > 1) {
              map.fitBounds(L.latLngBounds(points), { padding: [56, 56] });
            }
          });

          // Keep the needle pointing north as the map turns.
          const needle = compass.firstElementChild as HTMLElement | null;
          const sync = () => {
            const deg = Math.round(map.getBearing?.() ?? 0);
            if (needle) needle.style.transform = `rotate(${-deg}deg)`;
            compass.setAttribute("aria-label", deg ? "北を上に戻す" : "北が上です");
            compass.title = deg ? "北を上に戻す" : "北が上です";
          };
          map.on("rotate", sync);
          sync();

          return wrap;
        },
      });
      new Controls().addTo(map);

      mapRef.current = map;
      setMapReady(true);
      // The direction arrows are spaced in screen pixels and drawn at a screen
      // angle, so both zooming and turning the map invalidate them.
      map.on("zoomend rotate", () => setZoomTick((n) => n + 1));

      for (const s of spots) {
        const icon = L.divIcon({
          className: "",
          html: markerHtml(s.icon, s.id === activeId),
          iconSize: [40, 48],
          iconAnchor: [20, 46],
        });
        const marker = L.marker([s.lat, s.lng], {
          icon,
          // Icon-only markers are invisible to screen readers and to anyone
          // navigating by keyboard, so give each pin its name.
          title: `${s.name}（${s.designation}）`,
          alt: s.name,
          keyboard: true,
        });
        marker.on("click", () => onSelectRef.current?.(s.id));
        markersRef.current[s.id] = marker;
      }
      // Which of those 151 pins are actually on screen is decided by
      // declutter() below, not by adding them all at once.
      map.on("zoomend moveend", () => declutterRef.current?.());
      declutterRef.current?.();

      // The map is mounted inside a flex panel that can change size after
      // dynamic import resolution and screen transitions. Recalculate after
      // layout settles so Leaflet does not keep a zero-sized viewport.
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => map.invalidateSize(), 250);

      // Keep the viewport correct when the window or panel size changes;
      // otherwise Leaflet leaves grey gaps where it thinks there is no map.
      if (typeof ResizeObserver !== "undefined" && hostRef.current) {
        const observer = new ResizeObserver(() => map.invalidateSize());
        observer.observe(hostRef.current);
        resizeObserverRef.current = observer;
      }
    })();

    return () => {
      cancelled = true;
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
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
            buildStraightLegs(userPosRef.current, stopPoints);

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
          color: done ? "var(--color-route-done)" : "var(--color-terracotta)",
          weight: current ? 7 : 4,
          opacity: done ? 0.55 : current ? 0.95 : 0.5,
          dashArray: routed ? undefined : "6 8",
        }).addTo(layer);
      });

      // Direction arrows, evenly spaced by real distance so they do not bunch
      // up where the road geometry happens to have many points.
      legs.forEach((leg, index) => {
        if (index < activeLeg || leg.coords.length < 2) return;
        const current = index === activeLeg;
        // Space the arrows by how far apart they land on screen, not by a fixed
        // number of metres: at city-wide zoom a 70 m spacing crowded them into
        // an unreadable dotted line.
        const spacing = spacingForZoom(map.getZoom(), map.getCenter().lat, current ? 62 : 110);
        // A compass bearing is only the on-screen angle while north is up.
        // Turning the map swings the route line round to bearing + B on screen,
        // but leaflet-rotate deliberately keeps marker icons upright — it undoes
        // the rotation for them — so an arrow drawn at the plain compass bearing
        // stayed where it was and ended up wrong by exactly B. Adding the map's
        // bearing back puts each arrow on its line again.
        // (Measured: without this, 30 degrees of map rotation left the arrows
        // 30 degrees off the line; subtracting instead of adding made it 60.)
        const mapBearing = map.getBearing?.() ?? 0;
        for (const [point, angle] of arrowsAlong(leg.coords, spacing)) {
          L.marker(point, {
            icon: L.divIcon({
              className: "",
              html: arrowHtml(angle + mapBearing, current),
              iconSize: [22, 22],
              iconAnchor: [11, 11],
            }),
            interactive: false,
            zIndexOffset: 800,
          }).addTo(layer);
        }
      });

      // The router snaps each stop to the nearest road. Without this the line
      // looks like it walks straight past the marker; a dashed spur shows the
      // last few metres from the street to the site itself.
      if (snappedWaypoints?.length) {
        const offset = snappedWaypoints.length - routeSpots.length;
        routeSpots.forEach((spot, index) => {
          const snap = snappedWaypoints[index + Math.max(0, offset)];
          if (!snap) return;
          const target: [number, number] = [spot.lat, spot.lng];
          if (L.latLng(snap).distanceTo(L.latLng(target)) < 12) return;
          L.polyline([snap, target], {
            color: "var(--color-green-deep)",
            weight: 3,
            opacity: 0.85,
            dashArray: "2 6",
            lineCap: "round",
          }).addTo(layer);
        });
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

      const key = routeSpots.map((s) => s.id).join(",");
      if (fittedRouteRef.current !== key) {
        fittedRouteRef.current = key;
        const bounds = L.latLngBounds(all.length > 1 ? all : stopPoints);
        const here = userPosRef.current;
        if (here) bounds.extend(here);
        map.fitBounds(bounds, { padding: [56, 56] });
      }
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
    snappedWaypoints,
    zoomTick,
  ]);

  /**
   * 151 pins in three cities means a solid clump of overlapping icons around
   * every town centre — at the default zoom roughly a hundred pairs sit on top
   * of one another, so neither the map nor the individual pins can be read.
   *
   * Rather than pull in a clustering dependency, the map keeps one pin per
   * cell of a screen-space grid: whichever spot in that cell carries the
   * strongest designation wins, the rest stay off the map until the visitor
   * zooms in far enough for them to have room. Zooming in therefore reveals
   * more pins, which is the behaviour people already expect from a map.
   *
   * While an itinerary is being walked the map shows only its stops: during
   * guidance every other pin is noise.
   */
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    /** National designations outrank prefectural, which outrank municipal. */
    const rank = (spot: Spot): number => {
      const d = spot.designation ?? "";
      if (/国宝|国指定|重要文化財|特別/.test(d)) return 3;
      if (/県指定|府指定|道指定|都指定/.test(d)) return 2;
      if (/市指定|町指定|村指定|登録/.test(d)) return 1;
      return 0;
    };

    const run = () => {
      const routeIds = new Set(routeSpotsRef.current.map((s) => s.id));
      const guiding = routeIds.size > 0;
      const bounds = map.getBounds().pad(0.25);
      // One pin per grid cell; a cell a little wider than the 40px icon keeps
      // neighbours from touching.
      const CELL = 52;
      const best = new Map<string, { id: string; score: number }>();
      const keep = new Set<string>();

      for (const spot of spots) {
        const isRoute = routeIds.has(spot.id);
        // The stop being read about, and every stop on the itinerary, are
        // never hidden: those are the pins the visitor is looking for.
        if (isRoute || spot.id === activeId) {
          keep.add(spot.id);
          continue;
        }
        if (guiding) continue;
        if (!bounds.contains([spot.lat, spot.lng])) continue;

        const pt = map.latLngToContainerPoint([spot.lat, spot.lng]);
        const cell = `${Math.floor(pt.x / CELL)}:${Math.floor(pt.y / CELL)}`;
        const score = rank(spot);
        const held = best.get(cell);
        if (!held || score > held.score) best.set(cell, { id: spot.id, score });
      }
      for (const { id } of best.values()) keep.add(id);

      for (const [id, marker] of Object.entries(markersRef.current)) {
        const onMap = map.hasLayer(marker);
        if (keep.has(id) && !onMap) marker.addTo(map);
        else if (!keep.has(id) && onMap) map.removeLayer(marker);
      }
    };

    declutterRef.current = run;
    run();
    return () => {
      declutterRef.current = null;
    };
  }, [mapReady, spots, activeId, routeSpots, zoomTick]);

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
          html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <div style="padding:1px 7px;border-radius:999px;background:var(--color-location);color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);font:700 12px/1.6 system-ui,sans-serif;white-space:nowrap">現在地</div>
            <div style="width:18px;height:18px;border-radius:999px;background:var(--color-location);border:3px solid #fff;box-shadow:0 0 0 3px rgba(53,111,156,.3)"></div>
          </div>`,
          iconSize: [52, 42],
          iconAnchor: [26, 33],
        });
        userMarkerRef.current = L.marker(userPos, { icon, zIndexOffset: 1100 }).addTo(map);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapReady, userPos]);

  return <div ref={hostRef} className={className} />;
}

/** North-pointing needle drawn inside the compass button. */
function compassSvg(): string {
  return `<span style="display:block;width:20px;height:20px;transition:transform .15s"><svg viewBox="0 0 20 20" width="20" height="20"><path d="M10 2 L13.4 11 L10 9 L6.6 11 Z" fill="var(--color-amber)"/><path d="M10 18 L6.6 11 L10 13 L13.4 11 Z" fill="var(--color-route-done)"/></svg></span>`;
}

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

/**
 * Points spaced by real distance along a path, each with the bearing of travel.
 *
 * Index-based spacing bunched the arrows wherever the road geometry was dense,
 * and consecutive duplicate points (OSRM repeats the junction between steps)
 * produced a zero-length segment whose bearing defaulted to due north — which
 * is why some arrows pointed backwards.
 */
function arrowsAlong(
  coords: [number, number][],
  spacingMetres: number,
): [[number, number], number][] {
  const out: [[number, number], number][] = [];
  if (coords.length < 2) return out;

  let carried = spacingMetres / 2;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const length = metres(a, b);
    if (length < 0.5) continue; // duplicate point: no direction to read
    const angle = bearing(a, b);
    let travelled = carried;
    while (travelled <= length) {
      const t = travelled / length;
      out.push([
        [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        angle,
      ]);
      travelled += spacingMetres;
    }
    carried = travelled - length;
  }
  return out;
}

/** Metres that correspond to a given on-screen gap at the current zoom. */
function spacingForZoom(zoom: number, latitude: number, targetPixels: number): number {
  const metresPerPixel =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  return Math.max(25, targetPixels * metresPerPixel);
}

/** Rough planar distance in metres; plenty accurate over a city block. */
function metres(a: [number, number], b: [number, number]): number {
  const latMetres = (b[0] - a[0]) * 111320;
  const lngMetres = (b[1] - a[1]) * 111320 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(latMetres, lngMetres);
}

/** Compass bearing in degrees, clockwise from north, as drawn on screen. */
function bearing(a: [number, number], b: [number, number]): number {
  const north = b[0] - a[0];
  const east = (b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180);
  return (Math.atan2(east, north) * 180) / Math.PI;
}

function arrowHtml(angle: number, strong: boolean): string {
  const size = strong ? 15 : 12;
  const fill = strong ? "#ffffff" : "var(--color-panel)";
  return `<div style="transform:rotate(${angle}deg);display:flex;align-items:center;justify-content:center;width:22px;height:22px">
    <svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1 L13 12 L8 9.4 L3 12 Z" fill="${fill}" stroke="var(--color-ink)" stroke-width="1.4" stroke-linejoin="round"/>
    </svg></div>`;
}

/** Numbered badge marking a stop's position in the itinerary. */
function stopBadgeHtml(order: number, active: boolean): string {
  const bg = active ? "var(--color-amber)" : "var(--color-terracotta)";
  const ring = active ? "3px solid #fff" : "2px solid #fff";
  const size = active ? 30 : 26;
  const glow = active ? "0 0 0 4px rgba(156,101,28,.32)," : "";
  return `<div style="width:${size}px;height:${size}px;border-radius:999px;background:${bg};color:#fff;border:${ring};box-shadow:${glow}0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui,sans-serif">${order}</div>`;
}

function markerHtml(glyph: string, active: boolean): string {
  const bg = active ? "var(--color-terracotta)" : "var(--color-panel)";
  const fg = active ? "#fff" : "var(--color-ink)";
  const ring = active ? "var(--color-terracotta)" : "var(--color-border)";
  return `<div style="display:flex;flex-direction:column;align-items:center;">
    <div style="width:40px;height:40px;border-radius:999px;background:${bg};border:2px solid ${ring};display:flex;align-items:center;justify-content:center;font-size:20px;box-shadow:0 4px 10px rgba(0,0,0,.2);color:${fg}">${glyph}</div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${bg};margin-top:-2px;"></div>
  </div>`;
}
