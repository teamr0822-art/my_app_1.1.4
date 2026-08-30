/**
 * よりみっけ ── スポットデータの整備を1本にまとめたもの
 *
 *   1. 間引き … 収蔵品・古文書・無形民俗文化財を外す（訪ねられないため）
 *   2. 補完   … 解説が定型文のままのスポットに、ウィキペディアの冒頭を入れる
 *   3. 追加   … 同じ市で未収録の指定文化財を、記事があるものだけ足す
 *   4. 検証   … ID重複・座標の異常・必須項目の欠落を点検する
 *
 * 既存スポットは消えません。上書きされるのは「空だった解説文」だけです。
 *
 * 実行:
 *   node build-spots.mjs ../data/spots.json           # 下見（書き換えない）
 *   node build-spots.mjs ../data/spots.json --write   # 反映（.bak を自動作成）
 *
 * 段階を選ぶ: --no-prune / --no-enrich / --no-add
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";

const UA = "yorimikke-dataset/1.0 (cultural property guide)";
const WIKI = "https://ja.wikipedia.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";

/** 追加対象の市。増やすときはここに足す。 */
const CITIES = [
  { city: "高知市", prefecture: "高知県" },
  { city: "広島市", prefecture: "広島県" },
  { city: "指宿市", prefecture: "鹿児島県" },
];

const THIN = 25;       // これ未満の grounding を「空」とみなす
const ADD_LIMIT = 40;  // 1市あたりの追加上限
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "../data/spots.json";
const WRITE = args.includes("--write");
const skip = {
  prune: args.includes("--no-prune"),
  enrich: args.includes("--no-enrich"),
  add: args.includes("--no-add"),
};

/* ───────── 1. 間引き ───────── */

const NOT_A_PLACE = [
  { re: /^(木造|塑造|銅造|金銅|石造如来|色絵|楽焼|鉄打出|絹本|紙本)/, why: "美術工芸品（収蔵品）" },
  { re: /(短刀|^刀$|^太刀|梵鐘|茶碗|茶入|懸仏|神輿|馬印|獅子頭|具足|屏風|曼荼羅|来迎図|画像$|輪花鉢)/, why: "美術工芸品（収蔵品）" },
  { re: /(文書|検地帳|関係資料|^.*資料$|ネガフィルム|原板|石造物\()/, why: "古文書・記録類" },
];

export function classify(spot) {
  if (/無形/.test(spot.designation ?? "")) return "無形民俗文化財（芸能・行事）";
  for (const rule of NOT_A_PLACE) if (rule.re.test(spot.name)) return rule.why;
  if (/^オオサンショウウオ$/.test(spot.name)) return "種の指定（特定地点ではない）";
  return null;
}

/* ───────── 共通の小道具 ───────── */

export function parsePoint(wkt) {
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(wkt ?? "");
  return m ? [Number(m[2]), Number(m[1])] : null;
}

/** 読み上げる前提なので、文の切れ目で短くする。 */
export function trimGrounding(text, max = 300) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("．"));
  return end > 80 ? cut.slice(0, end + 1) : cut;
}

/** 誤った記事を貼るとAIがそのまま嘘をつくので、地名の一致で裏を取る。 */
export function looksRight(spot, article) {
  if (!article?.text || article.text.length < 40) return false;
  const hay = article.title + " " + article.text;
  const cityShort = (spot.city ?? "").replace(/[市区町村]$/, "");
  const prefShort = (spot.prefecture ?? "").replace(/[都道府県]$/, "");
  if (spot.city && (hay.includes(spot.city) || (cityShort && hay.includes(cityShort)))) return true;
  if (spot.prefecture && (hay.includes(spot.prefecture) || (prefShort && hay.includes(prefShort)))) return true;
  return article.title === spot.name;
}

// 上から順に判定するので、より限定的な語を先に置く
const ICONS = [
  [/聖堂|教会|カテドラル/, "🏛️"],
  [/銀行|庁舎|会館|ホール|資料館|記念館/, "🏛️"],
  [/[ザサ]クラ|桜|マツ|松|スギ|杉|イチョウ|銀杏|クス|楠|ソテツ|ケヤキ|カヤ|シイ|椎|自生地|並木|巨木|老樹|樹$/, "🌳"],
  [/城跡|城址|城$|城 /, "🏯"],
  [/神社|大社|八幡|天満宮|東照宮|宮$/, "⛩️"],
  [/学校|校舎|講堂|学舎/, "🏫"],
  [/遺跡|貝塚|窯跡|条里/, "🏺"],
  [/一里塚/, "🪧"],
  [/寺|院|堂|塔|庵/, "🛕"],
  [/古墳|墳墓|塚$/, "⚱️"],
  [/墓|廟|碑$/, "🪦"],
  [/橋|防波堤|港/, "🌉"],
  [/庭園|公園|池$/, "🌿"],
  [/駅|鉄道|停車場/, "🚉"],
  [/邸|住宅|屋敷|土蔵|倉庫|支廠/, "🏚️"],
  [/山$|岳|峠|島$|岩礁/, "⛰️"],
];
export function iconFor(name, designation = "") {
  for (const [re, icon] of ICONS) if (re.test(name)) return icon;
  if (/天然記念物/.test(designation)) return "🌳";
  if (/名勝/.test(designation)) return "🌿";
  return "📍";
}

export function makeId(city, name) {
  let h = 0;
  for (const ch of `${city}/${name}`) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `wd-${h.toString(36)}`;
}

/* ───────── ネットワーク ───────── */

async function wikiSearch(query) {
  const url = `${WIKI}?action=query&format=json&origin=*&list=search&srlimit=3&srsearch=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return [];
  return ((await res.json())?.query?.search ?? []).map((s) => s.title);
}

async function wikiExtract(title) {
  const url =
    `${WIKI}?action=query&format=json&origin=*&redirects=1&prop=extracts` +
    `&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) return null;
  const page = Object.values((await res.json())?.query?.pages ?? {})[0];
  if (!page?.extract) return null;
  return { title: page.title, text: page.extract.replace(/\s+/g, " ").trim() };
}

async function findArticle(spot) {
  for (const q of [`${spot.name} ${spot.city}`, spot.name]) {
    const titles = await wikiSearch(q);
    await sleep(350);
    for (const t of titles.slice(0, 2)) {
      const article = await wikiExtract(t);
      await sleep(350);
      if (article && looksRight(spot, article)) return article;
    }
  }
  return null;
}

function sparqlFor(city) {
  return `
SELECT ?item ?itemLabel ?desigLabel ?coord ?article WHERE {
  ?area rdfs:label "${city}"@ja .
  ?item wdt:P131* ?area ; wdt:P1435 ?desig ; wdt:P625 ?coord .
  ?article schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja". }
}
LIMIT 300`;
}

/* ───────── 4. 検証 ───────── */

const REQUIRED = ["id","name","icon","prefecture","city","designation","address","lat","lng","grounding","sources"];

export function validate(spots) {
  const problems = [];
  const ids = new Set(), names = new Set();
  for (const s of spots) {
    const where = s.name ?? "(名前なし)";
    for (const k of REQUIRED) if (s[k] === undefined || s[k] === null || s[k] === "") problems.push(`${where} … ${k} が空`);
    if (ids.has(s.id)) problems.push(`${where} … idが重複`); else ids.add(s.id);
    const nk = `${s.city}/${s.name}`;
    if (names.has(nk)) problems.push(`${where} … 同じ市に同名`); else names.add(nk);
    if (!(s.lat > 20 && s.lat < 46 && s.lng > 122 && s.lng < 154)) problems.push(`${where} … 座標が日本の範囲外 (${s.lat}, ${s.lng})`);
    if (/https?:\/\//.test(s.grounding ?? "")) problems.push(`${where} … groundingにURLが混入`);
    if ((s.grounding ?? "").length < THIN) problems.push(`${where} … 解説がまだ空`);
  }
  return problems;
}

/* ───────── 本体 ───────── */

async function main() {
  const data = JSON.parse(await readFile(file, "utf8"));
  let spots = data.spots;
  const before = spots.length;
  console.log(`読み込み: ${before}件（${file}）`);

  // 1. 間引き
  if (!skip.prune) {
    const removed = [];
    spots = spots.filter((s) => {
      const why = classify(s);
      if (why) { removed.push({ name: s.name, why }); return false; }
      return true;
    });
    const byWhy = {};
    for (const r of removed) (byWhy[r.why] ??= []).push(r.name);
    console.log(`\n【1】間引き: ${removed.length}件を除外`);
    for (const [why, names] of Object.entries(byWhy)) {
      console.log(`  ${why}（${names.length}件）`);
      console.log(`    ${names.slice(0, 8).join(" / ")}${names.length > 8 ? " …" : ""}`);
    }
  }

  // 2. 解説の補完
  const failed = [];
  if (!skip.enrich) {
    const thin = spots.filter((s) => (s.grounding ?? "").length < THIN);
    console.log(`\n【2】解説が空のスポット: ${thin.length}件`);
    let done = 0;
    for (const spot of thin) {
      const article = await findArticle(spot);
      if (!article) { failed.push(spot.name); console.log(`  - ${spot.name}: 記事なし`); continue; }
      spot.grounding = trimGrounding(article.text);
      const cite = `ウィキペディア日本語版「${article.title}」（CC BY-SA 4.0）`;
      if (!spot.sources.includes(cite)) spot.sources = [...spot.sources, cite];
      done++;
      console.log(`  ✓ ${spot.name} ← ${article.title}（${spot.grounding.length}字）`);
    }
    console.log(`  補完 ${done}件 / 見つからず ${failed.length}件`);
  }

  // 3. 追加
  if (!skip.add) {
    const haveName = new Set(spots.map((s) => `${s.city}/${s.name}`));
    const haveId = new Set(spots.map((s) => s.id));
    for (const { city, prefecture } of CITIES) {
      console.log(`\n【3】${prefecture} ${city}`);
      let rows = [];
      try {
        const url = `${SPARQL}?query=${encodeURIComponent(sparqlFor(city))}&format=json`;
        const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/sparql-results+json" } });
        if (!res.ok) throw new Error(`SPARQL ${res.status}`);
        rows = (await res.json()).results.bindings;
      } catch (err) { console.log(`  ! ${err.message}`); continue; }

      const byItem = new Map();
      for (const r of rows) {
        const k = r.item.value;
        const prev = byItem.get(k) ?? { name: r.itemLabel?.value, coord: r.coord?.value, desig: new Set(), article: r.article?.value };
        if (r.desigLabel?.value) prev.desig.add(r.desigLabel.value);
        byItem.set(k, prev);
      }
      console.log(`  Wikidata: ${byItem.size}件`);

      let added = 0;
      for (const it of byItem.values()) {
        if (added >= ADD_LIMIT) break;
        if (!it.name || /^Q\d+$/.test(it.name) || haveName.has(`${city}/${it.name}`)) continue;
        const coord = parsePoint(it.coord);
        if (!coord) continue;
        const title = decodeURIComponent(it.article.split("/wiki/")[1]).replace(/_/g, " ");
        const article = await wikiExtract(title);
        await sleep(350);
        const candidate = { name: it.name, city, prefecture };
        if (!article || !looksRight(candidate, article)) continue;
        if (classify({ name: it.name, designation: [...it.desig].join("・") })) continue;

        const id = makeId(city, it.name);
        if (haveId.has(id)) continue;
        haveId.add(id); haveName.add(`${city}/${it.name}`);
        const designation = [...it.desig].join("・") || "指定文化財";
        spots.push({
          id, name: it.name, icon: iconFor(it.name, designation),
          prefecture, city, designation, category: "文化財", era: "",
          address: `${prefecture}${city}`,
          lat: Number(coord[0].toFixed(6)), lng: Number(coord[1].toFixed(6)),
          grounding: trimGrounding(article.text),
          sources: ["Wikidata（CC0）", `ウィキペディア日本語版「${article.title}」（CC BY-SA 4.0）`],
        });
        console.log(`  ＋ ${it.name}`);
        added++;
      }
      console.log(`  追加 ${added}件`);
    }
  }

  // 統計を作り直す
  const byPref = {};
  for (const s of spots) {
    byPref[s.prefecture] ??= { total: 0, kunishitei: 0, kenshitei: 0, note: "収録件数" };
    byPref[s.prefecture].total++;
    if (/国[・指]|重要文化財|国宝|特別/.test(s.designation)) byPref[s.prefecture].kunishitei++;
    else if (/[県府都道][・指]/.test(s.designation)) byPref[s.prefecture].kenshitei++;
  }
  data.spots = spots;
  data.count = spots.length;
  data.statsByPrefecture = byPref;
  data.generatedAt = new Date().toISOString();

  // 4. 検証
  const problems = validate(spots);
  console.log(`\n【4】検証`);
  console.log(`  ${before}件 → ${spots.length}件`);
  console.log(`  都道府県別: ${Object.entries(byPref).map(([k, v]) => `${k} ${v.total}`).join(" / ")}`);
  const gl = spots.map((s) => (s.grounding ?? "").length);
  console.log(`  解説: 平均${Math.round(gl.reduce((a, b) => a + b, 0) / (gl.length || 1))}字`);
  console.log(`  ファイル: ${(JSON.stringify(data).length / 1024).toFixed(0)}KB`);
  if (problems.length) {
    console.log(`  ⚠ 要確認 ${problems.length}件`);
    for (const p of problems.slice(0, 25)) console.log(`    - ${p}`);
    if (problems.length > 25) console.log(`    … ほか ${problems.length - 25}件`);
  } else {
    console.log(`  ✓ 問題なし`);
  }
  if (failed.length) console.log(`\n手で解説を書く候補:\n  ${failed.join(" / ")}`);

  if (WRITE) {
    await copyFile(file, `${file}.bak`);
    await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`\n書き出しました: ${file}（元は ${file}.bak に退避）`);
  } else {
    console.log(`\n（--write を付けると実際に書き換えます。元ファイルは .bak に退避されます）`);
  }
}

if (process.argv[1]?.endsWith("build-spots.mjs")) main().catch((e) => { console.error(e); process.exit(1); });
