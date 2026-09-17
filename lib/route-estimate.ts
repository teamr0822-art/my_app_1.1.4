import { distanceMeters, type Spot } from "@/lib/spots";
import { hoursOf } from "@/lib/visit-hours";

/**
 * 行程の距離と時間を、アプリ側で計算する。
 *
 * ■ なぜ必要か
 * AIに距離と所要時間を書かせていたが、渡していたのは住所だけで座標は渡して
 * いなかった。結果、実測1.5kmの区間を「150m」と書くような答えが出ていた
 * （高知城→はりまや橋の実例）。合計時間も根拠のない足し算だった。
 *
 * 座標は最初から手元にある。数字は計算し、AIには「どこに行くか・なぜそこか」
 * だけを書かせる。地図を開けば OSRM が本当の道のりを出すので、ここで出すのは
 * あくまで「作成時点の見込み」。
 */

/** 移動手段ごとの速度（m/分）。map/route 画面と同じ値。 */
const METRES_PER_MINUTE: Record<string, number> = {
  徒歩: 80,
  自転車: 250,
  車: 500,
  公共交通: 380,
};

/**
 * 直線距離を道なりに直す係数。
 * 市街地の実測（高知市中心部の3区間を OSRM と比較）でおおむね1.2〜1.3倍。
 */
const DETOUR = 1.25;

/** 各スポットで実際に使う時間（分）。見学の性質で変える。 */
function dwellMinutes(spot: Spot): number {
  const kind = hoursOf(spot).kind;
  if (kind === "facility") return 40; // 受付・展示を見る
  if (kind === "daytime") return 20; // 境内をひと回り
  if (kind === "always") return 15; // 碑や跡を見て写真を撮る
  return 20;
}

export type Leg = { from: string; to: string; meters: number; minutes: number };

export type Estimate = {
  legs: Leg[];
  /** 移動距離の合計（m）。 */
  meters: number;
  /** 移動時間の合計（分）。 */
  travelMinutes: number;
  /** 見学時間の合計（分）。 */
  dwellMinutes: number;
  /** 移動＋見学。 */
  totalMinutes: number;
};

export function estimateItinerary(
  spots: Spot[],
  transport: string,
  start: [number, number] | null,
): Estimate | null {
  if (spots.length === 0) return null;
  const speed = METRES_PER_MINUTE[transport] ?? METRES_PER_MINUTE["徒歩"];

  const legs: Leg[] = [];
  let prev: [number, number] | null = start;
  let prevName = "現在地";
  for (const spot of spots) {
    if (prev) {
      const meters = distanceMeters(prev, [spot.lat, spot.lng]) * DETOUR;
      legs.push({
        from: prevName,
        to: spot.name,
        meters,
        minutes: meters / speed,
      });
    }
    prev = [spot.lat, spot.lng];
    prevName = spot.name;
  }

  const meters = legs.reduce((sum, l) => sum + l.meters, 0);
  const travel = legs.reduce((sum, l) => sum + l.minutes, 0);
  const dwell = spots.reduce((sum, s) => sum + dwellMinutes(s), 0);

  return {
    legs,
    meters,
    travelMinutes: Math.round(travel),
    dwellMinutes: dwell,
    totalMinutes: Math.round(travel + dwell),
  };
}

/**
 * 使える時間から、妥当な立ち寄り数の目安を出す。
 *
 * 以前はプロンプトに「『ゆったり』なら3か所以内」とだけ書いてあり、使える
 * 時間を見ていなかった。そのため「半日・ゆったり」で3か所・2時間半という、
 * 1時間半余る提案が出ていた。時間を主、気分を補正として扱う。
 */
export function suggestStopCount(
  minutes: number,
  transport: string,
  moods: string[],
): { min: number; max: number } {
  const speed = METRES_PER_MINUTE[transport] ?? METRES_PER_MINUTE["徒歩"];
  // 1か所あたり = 見学20分 + 次までの移動（市街地の平均的な間隔700m）
  const perStop = 20 + 700 / speed;
  let base = Math.floor(minutes / perStop);

  if (moods.includes("ゆったり")) base = Math.round(base * 0.7);
  if (moods.includes("たくさん歩きたい")) base = Math.round(base * 1.25);

  const center = Math.max(2, Math.min(10, base));
  return { min: Math.max(2, center - 1), max: Math.min(12, center + 1) };
}

/** 「1時間40分」のように読める形に。 */
export function describeMinutes(total: number): string {
  const m = Math.max(0, Math.round(total));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h && rest) return `${h}時間${rest}分`;
  if (h) return `${h}時間`;
  return `${rest}分`;
}
