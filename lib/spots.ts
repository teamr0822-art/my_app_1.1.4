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

/** 松江城のあたり。発表用に、測位できないときの既定の街にしている。 */
export const MATSUE_CENTER: [number, number] = [35.4704, 133.0536];

/**
 * 位置情報が使えないときに最初に見せる街。
 *
 * 発表の都合で松江市にしている。ここ（名前と座標の2つ）を変えれば、既定の街
 * はどこにでも移せる。スポットがまだ1件もない街でも指定できるように、
 * データから計算するのではなく固定値で持つ。
 */
export const FALLBACK_AREA = "松江市";
export const FALLBACK_CENTER: [number, number] = MATSUE_CENTER;

/**
 * 収録予定の街と、その目印の座標。
 *
 * AREA_CENTERS はスポットの重心から計算するため、データが入る前の街（松江市）
 * は選択肢にも出てこなかった。ここに書いた街は、スポットが0件でも「いる街を
 * 選ぶ」に並び、既定の街にもできる。スポットが入れば重心の値で上書きされる。
 */
const KNOWN_AREAS: Record<string, [number, number]> = {
  高知市: KOCHI_CENTER,
  広島市: [34.3955, 132.4596],
  指宿市: [31.2528, 130.6331],
  松江市: MATSUE_CENTER,
};

/**
 * The city a spot belongs to, for anything shown to a visitor or sent to the
 * model. The dataset spans several cities, so nothing may assume Kochi.
 */
export function areaOf(spot: Pick<Spot, "city" | "prefecture">): string {
  return spot.city ?? spot.prefecture ?? "";
}

/**
 * 各エリアのおおよその中心（収録スポットの重心。スポットがない街は KNOWN_AREAS）。
 *
 * 位置情報が使えないとき、利用者が「いま広島にいます」と手で選べるようにする
 * ための座標。端末の測位に失敗しただけで、よその街の距離を見せる状態を避ける。
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
  const out: Record<string, [number, number]> = { ...KNOWN_AREAS };
  for (const [area, v] of sums) out[area] = [v.lat / v.n, v.lng / v.n];
  return out;
})();

export function centerOfArea(area: string | null | undefined): [number, number] | null {
  if (!area) return null;
  return AREA_CENTERS[area] ?? null;
}

/**
 * ある地点がどの街か。いちばん近い街の中心で決める。
 *
 * 以前は「最寄りのスポットの街」で決めていたので、スポットがまだない松江に
 * いると、150km離れた広島市が「いまの街」になっていた。
 */
export function areaNear(pos: [number, number]): string {
  let best = "";
  let bestD = Infinity;
  for (const [area, center] of Object.entries(AREA_CENTERS)) {
    const d = distanceMeters(pos, center);
    if (d < bestD) {
      bestD = d;
      best = area;
    }
  }
  return best;
}

/** e.g. 「松江市周辺」 — the area label used when there is no live position. */
export function fallbackAreaLabel(): string {
  return `${FALLBACK_AREA}周辺`;
}

/**
 * Every city the app knows, in descending order of spot count. Cities listed in
 * KNOWN_AREAS appear even before their spots are added (they sort last).
 */
export const AREAS: string[] = (() => {
  const counts = new Map<string, number>(Object.keys(KNOWN_AREAS).map((a) => [a, 0]));
  for (const spot of data.spots) {
    const area = areaOf(spot);
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return Array.from(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area);
})();

/** その街に登録されているスポット。 */
export function spotsInArea(area: string | null | undefined): Spot[] {
  if (!area) return [];
  return data.spots.filter((spot) => areaOf(spot) === area);
}

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
