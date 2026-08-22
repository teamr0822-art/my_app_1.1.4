import dataset from "@/data/spots.json";

export type Spot = {
  id: string;
  name: string;
  icon: string;
  prefecture?: string;
  city?: string;
  designation: string;
  category: string;
  era: string;
  address: string;
  lat: number;
  lng: number;
  grounding: string;
  sources: string[];
  /** How ordinary visitors can access the site (public-access spots only). */
  access?: string;
};

export type SpotDataset = {
  generatedAt: string;
  source: string;
  count: number;
  stats?: { kunishitei: number; kenshitei: number; note: string };
  statsByPrefecture?: Record<string, { total?: number; kunishitei?: number; kenshitei?: number; note?: string }>;
  spots: Spot[];
};

const data = dataset as SpotDataset;

export const KOCHI_CENTER: [number, number] = [33.5626, 133.5493];

export const SPOTS: Spot[] = data.spots;

const aggregateStats: { kunishitei: number; kenshitei: number; note: string } = data.stats ? data.stats : Object.values(data.statsByPrefecture ?? {}).reduce<{ kunishitei: number; kenshitei: number; note: string }>(
  (total, prefecture) => ({
    kunishitei: total.kunishitei + (prefecture.kunishitei ?? 0),
    kenshitei: total.kenshitei + (prefecture.kenshitei ?? 0),
    note: "都道府県別集計",
  }),
  { kunishitei: 0, kenshitei: 0, note: "都道府県別集計" },
);

export const STATS = aggregateStats;
export const DATA_SOURCE = data.source;

export function getSpot(id: string): Spot | undefined {
  return SPOTS.find((s) => s.id === id);
}

/** Haversine distance in meters between two lat/lng points. */
export function distanceMeters(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/** Nearest spot to a given position. */
export function nearestSpot(pos: [number, number]): {
  spot: Spot;
  meters: number;
} {
  let best = SPOTS[0];
  let bestD = Infinity;
  for (const s of SPOTS) {
    const d = distanceMeters(pos, [s.lat, s.lng]);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { spot: best, meters: bestD };
}
