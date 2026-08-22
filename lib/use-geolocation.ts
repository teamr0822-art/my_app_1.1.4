"use client";

import { useEffect, useState } from "react";
import { KOCHI_CENTER } from "@/lib/spots";

export type GeoState = {
  pos: [number, number];
  /** true once we have a real device fix (not the fallback center). */
  located: boolean;
  error: string | null;
};

/**
 * Watches device position. Falls back to Kochi city center so the map and
 * distance calculations always have a usable coordinate. Demo spots cluster
 * around the castle, so the fallback keeps the experience coherent indoors.
 */
export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({
    pos: KOCHI_CENTER,
    located: false,
    error: null,
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, error: "位置情報に対応していません" }));
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setState({
          pos: [p.coords.latitude, p.coords.longitude],
          located: true,
          error: null,
        });
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message }));
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  return state;
}
