import { SPOTS, DATA_SOURCE } from "@/lib/spots";
import type { Spot } from "@/lib/spots";

export const maxDuration = 60;

/**
 * データ整備を、その場で実行して結果を返す一時的な道具。
 *
 *   1. 間引き … 収蔵品・古文書・無形民俗文化財を外す（訪ねられないため）
 *   2. 補完   … 解説が定型文のままのスポットに、ウィキペディアの冒頭を入れる
 *
 * ブラウザで /api/dataset を開くと spots.json がダウンロードされる。
 * それを data/spots.json に上書きアップロードすれば反映される。
 * 役目を終えたらこのファイルは削除してよい。
 */

const WIKI = "https://ja.wikipedia.org/w/api.php";
const UA = "yorimikke-dataset/1.0 (cultural property guide)";
const THIN = 25;

/* ───── 1. 間引き ───── */

const NOT_A_PLACE: { re: RegExp; why: string }[] = [
  { re: /^(木造|塑造|銅造|金銅|石造如来|色絵|楽焼|鉄打出|絹本|紙本)/, why: "美術工芸品" },
  { re: /(短刀|^刀$|^太刀|梵鐘|茶碗|茶入|懸仏|神輿|馬印|獅子頭|具足|屏風|曼荼羅|来迎図|画像$|輪花鉢)/, why: "美術工芸品" },
  { re: /(文書|検地帳|関係資料|^.*資料$|ネガフィルム|原板|石造物\()/, why: "古文書・記録類" },
];

function notAPlace(spot: { name: string; designation: string }): string | null {
  if (/無形/.test(spot.designation)) return "無形民俗文化財";
  for (const rule of NOT_A_PLACE) if (rule.re.test(spot.name)) return rule.why;
  if (/^オオサンショウウオ$/.test(spot.name)) return "種の指定";
  return null;
}

/* ───── 2. 解説の補完 ───── */

type Article = { title: string; text: string };

/**
 * 検索に使う中心語。「原爆ドーム(旧広島県産業奨励館)」→「原爆ドーム」のように、
 * 括弧書きや「附」「及び」以降を落として、記事名に近い形にする。
 */
function coreName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s*(附|付)\s*$/g, "")
    .split(/及び|並びに|・/)[0]
    .trim();
}

/** 市区町村・都道府県そのものの記事。個別のスポットの説明にはならない。 */
function isAreaArticle(title: string): boolean {
  return /^[^\s(（]{2,8}[都道府県市区町村]$/.test(title) || /^[^\s(（]+[都道府県市区町村]\s*[（(]/.test(title);
}

/** 「広島城跡」と「広島城」のように、同じ場所を指す言い換え。 */
const SAME_PLACE = /^(跡|址|阯|跡地|遺構)?$/;

/**
 * 「不動院鐘楼」と「不動院」のように、建物の一部とその親。
 * 親の記事はその建物の説明を含むので、案内の材料として使える。
 */
const PART_OF = /^(鐘楼|楼門|山門|唐門|翼廊|手水舎|本地堂|御供所|脇門|本堂|金堂|庫裏|多宝塔|塔|庭園|本丸|天守|石垣|門|堂|社殿|拝殿|本殿|居室|旧宅)/;

/**
 * 誤った記事を貼るとAIがそのまま嘘をつくので、名前の重なりで裏を取る。
 * 地名が本文にあるだけでは足りない ——「広島市」の記事はどのスポットにも
 * 一致してしまうため、記事名とスポット名が実際に重なることを求める。
 */
function looksRight(spot: Spot, article: Article | null): boolean {
  if (!article || article.text.length < 40) return false;
  if (isAreaArticle(article.title)) return false;

  const core = coreName(spot.name);
  if (core.length < 2) return false;

  // 記事名から地名の冠を外す（「広島東照宮」→「東照宮」）
  const cityCore = (spot.city ?? "").replace(/[市区町村]$/, "");
  const prefCore = (spot.prefecture ?? "").replace(/[都道府県]$/, "");
  const titles = new Set([coreName(article.title)]);
  for (const t of [...titles]) {
    for (const prefix of [cityCore, prefCore]) {
      if (prefix && t.startsWith(prefix) && t.length > prefix.length + 1) titles.add(t.slice(prefix.length));
    }
  }

  for (const title of titles) {
    if (title.length < 2) continue;
    if (title.includes(core)) return true;              // 記事のほうが広い名前
    if (core.startsWith(title)) {                        // スポットが親の一部
      const rest = core.slice(title.length);
      if (SAME_PLACE.test(rest) || PART_OF.test(rest)) return true;
    }
  }
  return false;
}

/** 読み上げる前提なので、文の切れ目で短くする。 */
function trim(text: string, max = 300): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("．"));
  return end > 80 ? cut.slice(0, end + 1) : cut;
}

async function wiki(params: Record<string, string>): Promise<any> {
  const url = `${WIKI}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, next: { revalidate: 86400 } });
  return res.ok ? res.json() : null;
}

async function extract(title: string): Promise<Article | null> {
  const json = await wiki({
    action: "query", redirects: "1", prop: "extracts",
    exintro: "1", explaintext: "1", titles: title,
  });
  const page: any = Object.values(json?.query?.pages ?? {})[0];
  if (!page?.extract) return null;
  return { title: page.title, text: String(page.extract).replace(/\s+/g, " ").trim() };
}

async function findArticle(spot: Spot): Promise<Article | null> {
  const core = coreName(spot.name);
  const queries = [...new Set([`${core} ${spot.city ?? ""}`.trim(), core, spot.name])];
  for (const q of queries) {
    const json = await wiki({ action: "query", list: "search", srlimit: "3", srsearch: q });
    const titles: string[] = (json?.query?.search ?? []).map((s: any) => s.title);
    for (const t of titles.slice(0, 2)) {
      const article = await extract(t);
      if (looksRight(spot, article)) return article;
    }
  }
  return null;
}

/** 同時実行数を絞って走らせる。相手先に負荷をかけず、時間内に終わらせるため。 */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const dryRun = params.get("apply") !== "1";

  const removed: { name: string; why: string }[] = [];
  const kept: Spot[] = [];
  for (const spot of SPOTS) {
    const why = notAPlace(spot);
    if (why) removed.push({ name: spot.name, why });
    else kept.push({ ...spot });
  }

  const thin = kept.filter((s) => (s.grounding ?? "").length < THIN);
  const filled: string[] = [];
  const missed: string[] = [];

  const articles = await pool(thin, 6, (spot) => findArticle(spot).catch(() => null));
  thin.forEach((spot, i) => {
    const article = articles[i];
    if (!article) { missed.push(spot.name); return; }
    spot.grounding = trim(article.text);
    const cite = `ウィキペディア日本語版「${article.title}」（CC BY-SA 4.0）`;
    if (!spot.sources.includes(cite)) spot.sources = [...spot.sources, cite];
    filled.push(`${spot.name} ← ${article.title}`);
  });

  const byPrefecture: Record<string, { total: number; kunishitei: number; kenshitei: number; note: string }> = {};
  for (const s of kept) {
    byPrefecture[s.prefecture ?? "不明"] ??= { total: 0, kunishitei: 0, kenshitei: 0, note: "収録件数" };
    const bucket = byPrefecture[s.prefecture ?? "不明"];
    bucket.total++;
    if (/国[・指]|重要文化財|国宝|特別/.test(s.designation)) bucket.kunishitei++;
    else if (/[県府都道][・指]/.test(s.designation)) bucket.kenshitei++;
  }

  if (dryRun) {
    return Response.json({
      これは下見です: "?apply=1 を付けて開くと spots.json がダウンロードされます",
      件数: `${SPOTS.length} → ${kept.length}`,
      外したもの: removed.length,
      外した内訳: removed.reduce<Record<string, string[]>>((acc, r) => {
        (acc[r.why] ??= []).push(r.name);
        return acc;
      }, {}),
      解説を補った: filled.length,
      補った一覧: filled,
      記事が見つからなかった: missed,
      都道府県別: byPrefecture,
    });
  }

  const dataset = {
    generatedAt: new Date().toISOString(),
    source: DATA_SOURCE,
    count: kept.length,
    statsByPrefecture: byPrefecture,
    spots: kept,
  };

  return new Response(JSON.stringify(dataset, null, 2) + "\n", {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="spots.json"',
    },
  });
}
