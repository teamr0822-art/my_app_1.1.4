"use client";

import { useEffect, useRef, useState } from "react";
import type { Spot } from "@/lib/spots";

export type RouteStep = {
  /** Japanese instruction, e.g. 「県道14号を右折」 */
  text: string;
  distance: number;
  icon: TurnIcon;
};

export type TurnIcon =
  | "start"
  | "straight"
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "arrive";

export type RouteLeg = {
  /** Geometry for this leg only, so each leg can be styled separately. */
  coords: [number, number][];
  distance: number;
  duration: number;
  steps: RouteStep[];
};

export type Directions = {
  legs: RouteLeg[];
  coords: [number, number][];
  distance: number;
  duration: number;
  /**
   * Where the router actually put each waypoint. Sites set back from the road
   * snap to the nearest street, so the drawn route can run *past* the marker.
   * Keeping the snapped points lets the map join them to the real location.
   */
  snapped: [number, number][];
};

type State = {
  directions: Directions | null;
  loading: boolean;
  /** Set when routing failed; the map then falls back to straight lines. */
  error: string | null;
};

/**
 * The public OSRM demo server only hosts the car profile, so its durations are
 * driving times whatever profile we ask for (10km "in 19 minutes" on foot).
 * Distances are still real road distances, so we derive the time ourselves.
 */
const METRES_PER_MINUTE: Record<string, number> = {
  "徒歩": 80, // ~4.8 km/h
  "自転車": 250, // ~15 km/h
};

function travelSeconds(distance: number, transport: string, osrm: number): number {
  const speed = METRES_PER_MINUTE[transport];
  if (!speed) return osrm; // 公共交通: the driving estimate is the closer guess.
  return (distance / speed) * 60;
}

/** The public demo router is slow and occasionally silent; never wait forever. */
const ROUTE_TIMEOUT_MS = 12_000;

/**
 * One retry, because the free OSRM demo server drops requests under load and a
 * failed lookup means the map falls back to straight lines with no directions.
 */
async function fetchRoute(url: string): Promise<any> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`routing ${response.status}`);
      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 700));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("routing failed");
}

function profileFor(transport: string): string {
  if (transport === "自転車") return "bike";
  if (transport === "公共交通") return "driving";
  return "foot";
}

const MODIFIER_LABEL: Record<string, string> = {
  left: "左折",
  right: "右折",
  "slight left": "斜め左",
  "slight right": "斜め右",
  "sharp left": "鋭く左折",
  "sharp right": "鋭く右折",
  straight: "直進",
  uturn: "Uターン",
};

const MODIFIER_ICON: Record<string, TurnIcon> = {
  left: "left",
  right: "right",
  "slight left": "slight-left",
  "slight right": "slight-right",
  "sharp left": "sharp-left",
  "sharp right": "sharp-right",
  straight: "straight",
  uturn: "uturn",
};

/** Turns one OSRM step into a short Japanese instruction. */
function describeStep(step: any, isLast: boolean): RouteStep {
  const type: string = step?.maneuver?.type ?? "continue";
  const modifier: string = step?.maneuver?.modifier ?? "straight";
  const road: string = (step?.name ?? "").trim();
  const on = road ? `${road}を` : "";
  const distance: number = step?.distance ?? 0;

  let text: string;
  let icon: TurnIcon = MODIFIER_ICON[modifier] ?? "straight";

  switch (type) {
    case "depart":
      text = road ? `${road}に出て進みます` : "現在地から出発します";
      icon = "start";
      break;
    case "arrive":
      text = isLast ? "目的地に到着します" : "経由地に到着します";
      icon = "arrive";
      break;
    case "roundabout":
    case "rotary":
      text = "ロータリーに入ります";
      break;
    case "merge":
      text = `${on}合流します`;
      break;
    case "fork":
      text = `分岐を${MODIFIER_LABEL[modifier] ?? "直進"}します`;
      break;
    case "end of road":
      text = `突き当たりを${MODIFIER_LABEL[modifier] ?? "直進"}します`;
      break;
    case "new name":
    case "continue":
      text = road ? `${road}をそのまま進みます` : "そのまま直進します";
      icon = "straight";
      break;
    default:
      text = `${on}${MODIFIER_LABEL[modifier] ?? "直進"}します`;
  }

  return { text, distance, icon };
}

/**
 * Turn-by-turn directions from the user's position through every stop.
 *
 * The user's own position is the first waypoint, so the itinerary answers
 * "how do I get there from here" instead of starting at the first spot.
 */
export function useRouteDirections(
  userPos: [number, number] | null,
  spots: Spot[],
  transport: string,
): State {
  const [state, setState] = useState<State>({
    directions: null,
    loading: false,
    error: null,
  });

  // A live GPS fix jitters by a few metres every second. Re-routing on every
  // one of those would hammer the routing service and make the panel flicker,
  // so the position is quantised: directions are refreshed only once the
  // visitor has actually moved about 50 metres.
  const cell = userPos
    ? `${Math.round(userPos[0] / 0.0005)},${Math.round(userPos[1] / 0.0005)}`
    : "none";
  const key = [cell, spots.map((s) => s.id).join(","), transport].join("|");

  // The exact fix is still used as the starting waypoint when a refresh runs.
  const userPosRef = useRef<[number, number] | null>(userPos);
  userPosRef.current = userPos;

  useEffect(() => {
    let cancelled = false;
    if (!spots.length) {
      setState({ directions: null, loading: false, error: null });
      return;
    }

    const here = userPosRef.current;
    const waypoints: [number, number][] = [
      ...(here ? [here] : []),
      ...spots.map((s) => [s.lat, s.lng] as [number, number]),
    ];
    if (waypoints.length < 2) {
      setState({ directions: null, loading: false, error: null });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      // OSRM expects lng,lat pairs in the path, and steps=true for turn text.
      const path = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(";");
      const url =
        `https://router.project-osrm.org/route/v1/${profileFor(transport)}/${path}` +
        `?overview=full&geometries=geojson&steps=true`;
      try {
        const data = await fetchRoute(url);
        if (cancelled) return;
        if (data.code !== "Ok" || !data.routes?.[0]) {
          setState({ directions: null, loading: false, error: data.code ?? "error" });
          return;
        }
        const route = data.routes[0];
        const legs: RouteLeg[] = (route.legs ?? []).map((leg: any) => {
          const coords: [number, number][] = [];
          for (const step of leg.steps ?? []) {
            for (const [lng, lat] of step.geometry?.coordinates ?? []) {
              coords.push([lat, lng]);
            }
          }
          const rawSteps = (leg.steps ?? []).filter(
            (s: any) => (s?.distance ?? 0) > 5 || s?.maneuver?.type === "arrive",
          );
          const legDistance = leg.distance ?? 0;
          return {
            coords,
            distance: legDistance,
            duration: travelSeconds(legDistance, transport, leg.duration ?? 0),
            steps: rawSteps.map((s: any, i: number) =>
              describeStep(s, i === rawSteps.length - 1),
            ),
          };
        });
        const coords: [number, number][] = (route.geometry?.coordinates ?? []).map(
          ([lng, lat]: [number, number]) => [lat, lng] as [number, number],
        );
        const snapped: [number, number][] = (data.waypoints ?? []).map(
          (w: any) => [w.location?.[1] ?? 0, w.location?.[0] ?? 0] as [number, number],
        );
        setState({
          directions: {
            legs,
            coords,
            snapped,
            distance: route.distance ?? 0,
            duration: travelSeconds(
              route.distance ?? 0,
              transport,
              route.duration ?? 0,
            ),
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          directions: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

/** "12分" / "1時間5分" */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}時間${rest}分` : `${hours}時間`;
}
