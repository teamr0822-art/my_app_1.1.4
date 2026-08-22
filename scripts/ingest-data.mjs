/**
 * Data ingest for 「話して発見」 (Hanashite Hakken)
 *
 * Builds a production dataset of real Kochi City cultural properties.
 * Each entry carries a verified postal address; coordinates are resolved at
 * ingest time via the GSI (国土地理院) address-search geocoder, then validated
 * to fall inside the Kochi City bounding box. The resulting JSON is committed
 * to data/spots.json and consumed by the Next.js app at build/runtime.
 *
 * Run: node scripts/ingest-data.mjs
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const GSI = "https://msearch.gsi.go.jp/address-search/AddressSearch";

// Kochi City bounding box (generous) for validating geocode results.
const BOUNDS = { latMin: 33.42, latMax: 33.72, lngMin: 133.40, lngMax: 133.70 };

/**
 * Curated list of real, well-documented cultural properties in Kochi City.
 * `grounding` is concise factual context the LLM guide is constrained to.
 * These are the facts the AI is allowed to speak from — it must not invent
 * beyond them and must say so when a detail is unknown.
 */
const SOURCE = [
  {
    id: "kochi-castle",
    name: "高知城",
    icon: "🏯",
    designation: "国指定重要文化財・史跡",
    category: "城郭建築",
    era: "江戸時代（1603年築城、1747-1753年再建）",
    address: "高知県高知市丸ノ内一丁目2-1",
    grounding:
      "土佐藩初代藩主・山内一豊により1603年に築城された平山城。1727年の大火で追手門以外の建物の大半を焼失し、1747年から1753年にかけて再建された。天守・本丸御殿（懐徳館）・追手門など本丸の建造物群が現存する全国的にも希少な城で、天守と本丸御殿が両方残るのは高知城のみ。天守は独立式望楼型4重6階。国の重要文化財（建造物15棟）および史跡に指定されている。",
    sources: ["高知城管理事務所 案内資料", "文化庁 国指定文化財等データベース"],
  },
  {
    id: "chikurinji-hondo",
    name: "竹林寺本堂（文殊堂）",
    icon: "🛕",
    designation: "国指定重要文化財（建造物）",
    category: "寺院建築",
    era: "室町時代（1573年頃）",
    address: "高知県高知市五台山3577",
    grounding:
      "四国八十八箇所霊場第31番札所、五台山竹林寺の本堂。文殊菩薩を本尊とし文殊堂とも呼ばれる。入母屋造・柿葺きの和様を基調とした建築で、室町時代後期の様式を伝える。本尊の文殊菩薩像を含む寺宝も多く、竹林寺庭園は国の名勝に指定されている。",
    sources: ["竹林寺 寺伝", "文化庁 国指定文化財等データベース"],
  },
  {
    id: "chikurinji-garden",
    name: "竹林寺庭園",
    icon: "🍃",
    designation: "国指定名勝",
    category: "庭園",
    era: "鎌倉時代",
    address: "高知県高知市五台山3577",
    grounding:
      "五台山竹林寺の書院前に広がる池泉鑑賞式庭園。夢窓疎石の作庭と伝えられ、五台山の地形を活かした山水の構成が特徴。国の名勝に指定されている。四季の景観、とくに紅葉の名所として知られる。",
    sources: ["竹林寺 寺伝", "文化庁 国指定文化財等データベース"],
  },
  {
    id: "tosa-jinja",
    name: "土佐神社",
    icon: "⛩️",
    designation: "国指定重要文化財（建造物）",
    category: "神社建築",
    era: "戦国時代（1570年）",
    address: "高知県高知市一宮しなね2丁目16-1",
    grounding:
      "土佐国の総鎮守（一宮）。現在の社殿は1570年に長宗我部元親によって再建されたもので、本殿・幣殿・拝殿が十字型（入蜻蛉形）に配置される独特の形式をもつ。本殿・幣殿・拝殿、鼓楼、楼門（神光門）が国の重要文化財に指定されている。毎年8月に志那禰祭（しなねまつり）が行われる。",
    sources: ["土佐神社 由緒", "文化庁 国指定文化財等データベース"],
  },
  {
    id: "yamauchi-nagaya",
    name: "旧山内家下屋敷長屋",
    icon: "🏘️",
    designation: "国指定重要文化財（建造物）",
    category: "武家建築",
    era: "江戸時代末期（1864-1865年頃）",
    address: "高知県高知市鷹匠町1丁目3-35",
    grounding:
      "土佐藩主山内家の下屋敷に付属していた長屋。幕末の元治年間に建てられたと伝わる。桁行の長い木造平屋建で、藩の家臣や使用人が用いた建物とされる。城下町の武家屋敷の構えを今に伝える貴重な遺構として国の重要文化財に指定されている。",
    sources: ["高知市教育委員会 文化財案内", "文化庁 国指定文化財等データベース"],
  },
  {
    id: "yamauchi-jinja",
    name: "山内神社",
    icon: "⛩️",
    designation: "市域の主要文化財",
    category: "神社",
    era: "江戸時代〜近代",
    address: "高知県高知市鷹匠町2丁目4-65",
    grounding:
      "土佐藩主山内家歴代を祀る神社。鏡川のほとりに鎮座し、藩祖山内一豊夫妻らを祭神とする。境内には山内家に関わる石碑や資料館があり、幕末の藩主山内容堂ゆかりの地としても知られる。",
    sources: ["山内神社 由緒", "高知市観光案内"],
  },
  {
    id: "kakegawa-jinja",
    name: "掛川神社",
    icon: "⛩️",
    designation: "市指定有形文化財（建造物）",
    category: "神社建築",
    era: "江戸時代",
    address: "高知県高知市薊野中町3-30",
    grounding:
      "土佐藩2代藩主山内忠義が、遠江国掛川（山内家の旧領）の神社を勧請して創建したと伝わる神社。江戸時代の社殿建築を伝え、本殿などが高知市の文化財に指定されている。",
    sources: ["掛川神社 由緒", "高知市教育委員会 文化財案内"],
  },
  {
    id: "godaisan",
    name: "五台山",
    icon: "⛰️",
    designation: "県指定名勝",
    category: "名勝・景勝地",
    era: "—",
    address: "高知県高知市五台山",
    grounding:
      "高知市街の東に位置する標高約145mの丘陵。竹林寺や牧野植物園があり、山頂の展望台からは高知市街と浦戸湾を一望できる。景勝地として県の名勝に指定されている。",
    sources: ["高知市観光案内", "高知県文化財一覧"],
  },
  {
    id: "godaisan-makino",
    name: "牧野富太郎ゆかりの地（五台山）",
    icon: "🌿",
    designation: "市域の主要文化財関連地",
    category: "記念地",
    era: "近代",
    address: "高知県高知市五台山4200-6",
    grounding:
      "「日本の植物学の父」と呼ばれる植物学者・牧野富太郎（高知県出身）を記念して五台山に開設された県立牧野植物園がある一帯。牧野が収集・研究した植物にちなむ約3000種以上の植物が育てられている。",
    sources: ["高知県立牧野植物園 案内", "高知市観光案内"],
  },
  {
    id: "harimayabashi",
    name: "はりまや橋",
    icon: "🌉",
    designation: "市の名所・史跡的名所",
    category: "名所",
    era: "江戸時代〜",
    address: "高知県高知市はりまや町1丁目1",
    grounding:
      "高知市中心部にかかる橋で、よさこい節に歌われた「純信・お馬」の悲恋の舞台として知られる高知を代表する名所。江戸���代、堀川をはさんで商家の播磨屋と櫃屋があり、両者が架けた私設の橋が名の由来とされる。現在は朱塗りの欄干が復元されている。",
    sources: ["高知市観光案内", "よさこい節 伝承"],
  },
  {
    id: "godaisan-hitsuzan",
    name: "要法寺",
    icon: "🛕",
    designation: "市域の寺院",
    category: "寺院",
    era: "江戸時代",
    address: "高知県高知市洞ケ島町5-46",
    grounding:
      "高知市街にある日蓮宗の寺院。土佐藩ゆかりの寺として知られ、境内に藩政期以来の墓所や石造物を伝える。",
    sources: ["高知市観光案内"],
  },
  {
    id: "kochi-otemon",
    name: "高知城 追手門",
    icon: "🚪",
    designation: "国指定重要文化財（建造物）",
    category: "城門",
    era: "江戸時代（1664年再建）",
    address: "高知県高知市丸ノ内一丁目2-1",
    grounding:
      "高知城の正門にあたる櫓門。1664年に再建されたもので、1727年の大火でも焼け残った数少ない建物のひとつ。石垣の上に渡櫓を載せた堅固な構えで、追手門越しに天守を望む構図は高知城を象徴する景観として知られる。国の重要文化財。",
    sources: ["高知城管理事務所 案内資料", "文化庁 国指定文化財等データベース"],
  },
  // --- 全国遺跡報告総覧（奈良文化財研究所）に発掘記録があり、
  //     かつ一般の人が屋外で見学できる遺跡（古墳）を精選して追加 ---
  {
    id: "asakura-kofun",
    name: "朝倉古墳",
    icon: "⚱️",
    designation: "県指定史跡",
    category: "古墳",
    era: "古墳時代後期（7世紀頃）",
    address: "高知県高知市朝倉丙",
    grounding:
      "高知市朝倉、赤鬼山の南麓にある古墳時代後期（7世紀頃）の古墳。切石を組んだ横穴式石室が露出しており、精巧な石室構造で知られる。1950年に高知県の史跡に指定された。南国市の明見彦山1号墳、高知市の小蓮古墳とともに「土佐三大古墳」と呼ばれる。石室は屋外から見学できるが、墳丘や石室内部への立ち入りは禁止されている。詳細な被葬者などは分かっていない。",
    sources: [
      "全国遺跡報告総覧（奈良文化財研究所）",
      "高知県教育委員会 文化財情報",
    ],
    access:
      "屋外にあり見学無料・自由。ただし墳丘や石室内部への立ち入りは禁止。周辺は住宅地のため見学時は近隣に配慮してください。",
  },
  {
    id: "koren-kofun",
    name: "小蓮古墳",
    icon: "⚱️",
    designation: "県指定史跡",
    category: "古墳",
    era: "古墳時代後期",
    address: "高知県高知市塚ノ原",
    grounding:
      "高知市塚ノ原にある古墳時代後期の古墳。横穴式石室をもち、高知県の史跡に指定されている。朝倉古墳、明見彦山1号墳（南国市）とともに「土佐三大古墳」に数えられる。発掘調査の記録が残るが、詳しい被葬者などは分かっていない。",
    sources: [
      "全国遺跡報告総覧（奈良文化財研究所）",
      "高知県教育委員会 文化財情報",
    ],
    access:
      "屋外にあり見学可能。訪問の際は現地の案内板や高知市の文化財情報で最新の公開状況をご確認ください。",
  },
];

async function geocode(query) {
  const url = `${GSI}?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "hanashite-hakken-ingest/1.0" } });
  if (!res.ok) throw new Error(`GSI ${res.status} for ${query}`);
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

function inBounds(lat, lng) {
  return (
    lat >= BOUNDS.latMin &&
    lat <= BOUNDS.latMax &&
    lng >= BOUNDS.lngMin &&
    lng <= BOUNDS.lngMax
  );
}

/** Pick the best geocode candidate that falls inside Kochi City. */
function pickCandidate(features) {
  for (const f of features) {
    const c = f?.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lng, lat] = c;
    if (inBounds(lat, lng)) return { lat, lng, matched: f?.properties?.title || "" };
  }
  return null;
}

async function main() {
  const out = [];
  const failures = [];

  for (const item of SOURCE) {
    // Try full address first, then progressively coarser fallbacks.
    const queries = [item.address];
    // coarser fallback: drop building number
    const coarse = item.address.replace(/[0-9\-−ー－丁目番号]+$/u, "").trim();
    if (coarse && coarse !== item.address) queries.push(coarse);

    let resolved = null;
    let usedQuery = null;
    for (const q of queries) {
      try {
        const feats = await geocode(q);
        const pick = pickCandidate(feats);
        if (pick) {
          resolved = pick;
          usedQuery = q;
          break;
        }
      } catch (err) {
        console.warn(`  ! geocode error for "${q}": ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, 350)); // be polite to GSI
    }

    if (!resolved) {
      failures.push(item.name);
      console.warn(`✗ ${item.name}: could not geocode within Kochi bounds`);
      continue;
    }

    out.push({
      id: item.id,
      name: item.name,
      icon: item.icon,
      designation: item.designation,
      category: item.category,
      era: item.era,
      address: item.address,
      lat: Number(resolved.lat.toFixed(6)),
      lng: Number(resolved.lng.toFixed(6)),
      grounding: item.grounding,
      sources: item.sources,
      ...(item.access ? { access: item.access } : {}),
    });
    console.log(
      `✓ ${item.name} -> ${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)} (via "${usedQuery}" / ${resolved.matched})`,
    );
    await new Promise((r) => setTimeout(r, 350));
  }

  const dataset = {
    generatedAt: new Date().toISOString(),
    source:
      "高知市の実在文化財を精選（一部の遺跡は全国遺跡報告総覧／奈良文化財研究所の発掘記録を参考に、一般の人が見学できる場所に限定）。座標は国土地理院 住所検索APIによりジオコーディングし高知市域内で検証。",
    count: out.length,
    stats: { kunishitei: 44, kenshitei: 39, note: "高知市内の国・県指定文化財の総数（高知市統計）" },
    spots: out,
  };

  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(
    join(ROOT, "data", "spots.json"),
    JSON.stringify(dataset, null, 2) + "\n",
    "utf8",
  );

  console.log(`\nWrote data/spots.json with ${out.length} spots.`);
  if (failures.length) {
    console.log(`Failed to geocode: ${failures.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
