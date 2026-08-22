"use client";

import { useEffect, useRef } from "react";
import type { Map as LMap, Marker } from "leaflet";
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
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markersRef = useRef<Record<string, Marker>>({});
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

      if (routeSpots.length > 1) {
        const coordinates = routeSpots.map((s) => `${s.lng},${s.lat}`).join(";");
        try {
          const response = await fetch(`https://router.project-osrm.org/route/v1/${routeProfile("徒歩")}?overview=full&geometries=geojson&coordinates=${coordinates}`);
          const data = await response.json();
          const line = data.routes?.[0]?.geometry?.coordinates?.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
          if (line?.length) L.polyline(line, { color: "#c96f4a", weight: 5, opacity: 0.9 }).addTo(map);
        } catch (error) {
          console.log("[v0] Route geometry unavailable", error);
        }
      }

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
        userMarkerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [userPos]);

  return <div ref={hostRef} className={className} />;
}

function routeProfile(transport: string): string {
  return transport === "自転車" ? "cycling" : "driving";
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
