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
  /**
   * 現地で実際に要る情報の枠。
   *
   * 「何時に開くか」の次に聞かれるのがトイレ・駐車場・雨宿りで、いまのデータに
   * は無い。項目だけ先に決めておき、埋まったスポットから表示する（未入力の
   * スポットは何も出ない＝嘘をつかない）。true だけを入れること。「無い」こと
   * を false で断言するには現地確認が要るため、不明は未入力のままにする。
   */
  facilities?: {
    /** 敷地内または隣接に公衆トイレがある */
    toilet?: boolean;
    /** 見学者が使える駐車場がある */
    parking?: boolean;
    /** 屋根のある休憩場所があり、雨宿りできる */
    shelter?: boolean;
    /** 屋内展示が主で、雨の日でも見学できる */
    indoor?: boolean;
  };
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

/**
 * Where the map and the "near you" list start when the device has no fix.
 * Named separately from KOCHI_CENTER so the fallback can move to another city
 * without every call site reading as "Kochi".
 */
export const FALLBACK_CENTER: [number, number] = KOCHI_CENTER;

/**
 * The city a spot belongs to, for anything shown to a visitor or sent to the
 * model. The dataset already spans three cities, so nothing may assume Kochi.
 */
export function areaOf(spot: Pick<Spot, "city" | "prefecture">): string {
  return spot.city ?? spot.prefecture ?? "";
}

/**
 * 各エリアのおおよその中心（収録スポットの重心）。
 *
 * 位置情報が使えないとき、利用者が「いま広島にいます」と手で選べるようにする
 * ための座標。端末の測位に失敗しただけで、高知の距離を見せられる状態を避ける。
 */
export const AREA_CENTERS: Record<string, [number, number]> = (() => {
  const sums = new Map<string, { lat: number; lng: number; n: number }>();
  for (const spot of data.spots) {
    const area = areaOf(spot);
    if (!area) continue;
    const cur = sums.get(area) ?? { lat: 0, lng: 0, n: 0 };
    cur.lat += spot.lat;
    cur.lng += spot.lng;
    cur.n += 1;
    sums.set(area, cur);
  }
  const out: Record<string, [number, number]> = {};
  for (const [area, v] of sums) out[area] = [v.lat / v.n, v.lng / v.n];
  return out;
})();

export function centerOfArea(area: string | null | undefined): [number, number] | null {
  if (!area) return null;
  return AREA_CENTERS[area] ?? null;
}

/** e.g. 「高知市周辺」 — the area label used when there is no live position. */
export function fallbackAreaLabel(): string {
  const near = nearestSpot(FALLBACK_CENTER);
  const area = near ? areaOf(near.spot) : "";
  return area ? `${area}周辺` : "登録エリア";
}

/** Every city present in the dataset, in descending order of spot count. */
export const AREAS: string[] = Array.from(
  data.spots.reduce((counts, spot) => {
    const area = areaOf(spot);
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
    return counts;
  }, new Map<string, number>()),
)
  .sort((a, b) => b[1] - a[1])
  .map(([area]) => area);

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
