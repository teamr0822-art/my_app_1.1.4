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
  /** Travel mode used to pick the OSRM routing profile. */
  routeTransport?: string;
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
  routeTransport = "徒歩",
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
  const routeLayerRef = useRef<LayerGroup | null>(null);
  // The map is created inside an async effect, so the route effect can run
  // before mapRef is populated. This flag re-runs the route effect once the
  // map actually exists.
  const [mapReady, setMapReady] = useState(false);
  const userMarkerRef = useRef<Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Init map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !hostRef.current || mapRef.current) return;

      const map = L.map(hostRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView(center, zoom);

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

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

  // Draw the walking route. This lives in its own effect so the line is
  // redrawn whenever the itinerary changes, not only on first mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      const map = mapRef.current;
      if (cancelled || !map) return;

      // Clear the previous route before drawing a new one.
      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      if (routeSpots.length < 2) return;

      const layer = L.layerGroup().addTo(map);
      routeLayerRef.current = layer;

      const points = routeSpots.map((s) => [s.lat, s.lng] as [number, number]);

      // Numbered stop badges so the itinerary reads in order.
      routeSpots.forEach((s, index) => {
        L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            className: "",
            html: stopBadgeHtml(index + 1),
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          }),
          zIndexOffset: 1000,
        })
          .addTo(layer)
          .on("click", () => onSelectRef.current?.(s.id));
      });

      // OSRM wants the coordinates in the PATH, not as a query parameter.
      // The previous URL shape always returned 400, so no line was ever drawn.
      const coordinates = routeSpots.map((s) => `${s.lng},${s.lat}`).join(";");
      const profile = routeProfile(routeTransport);
      let line: [number, number][] | null = null;
      try {
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/${profile}/${coordinates}?overview=full&geometries=geojson`,
        );
        const data = await response.json();
        if (data.code === "Ok") {
          line =
            data.routes?.[0]?.geometry?.coordinates?.map(
              ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
            ) ?? null;
        } else {
          console.log("[v0] OSRM returned", data.code, data.message);
        }
      } catch (error) {
        console.log("[v0] Route geometry unavailable", error);
      }

      if (cancelled || !mapRef.current) return;

      if (line?.length) {
        L.polyline(line, { color: "#c96f4a", weight: 5, opacity: 0.9 }).addTo(layer);
      } else {
        // Straight dashed fallback so the order is still readable when the
        // routing service is unreachable.
        L.polyline(points, {
          color: "#c96f4a",
          weight: 3,
          opacity: 0.7,
          dashArray: "6 8",
        }).addTo(layer);
      }

      map.fitBounds(L.latLngBounds(line?.length ? line : points), {
        padding: [48, 48],
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, routeSpots.map((s) => s.id).join(","), routeTransport]);

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

  return <div ref={hostRef} className={className} />;
}

function routeProfile(transport: string): string {
  if (transport === "自転車") return "bike";
  if (transport === "公共交通") return "driving";
  return "foot";
}

/** Small numbered badge marking a stop's position in the itinerary. */
function stopBadgeHtml(order: number): string {
  return `<div style="width:26px;height:26px;border-radius:999px;background:#c96f4a;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:700 13px/1 system-ui,sans-serif">${order}</div>`;
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
