import type { Spot } from "@/lib/spots";

/**
 * 見学できる時間の「目安」。
 *
 * ■ なぜ「○時〜○時」と書かないのか
 * データセット(data/spots.json)の151件に営業時間・開館時間の項目はありません。
 * ある/ないの問題ではなく、公式に確認していない時刻を表示すると「開いている
 * と書いてあったのに閉まっていた」が起こります。旅行者にとってこれは、何も
 * 表示しないより悪い結果です。
 *
 * そこで、ここでは断言できることだけを出します。
 *   - 屋外の史跡・記念碑・巨樹などは、時間の制限なく見られる（＝断言できる）
 *   - 寺社の境内は日中が目安（＝目安と明示する）
 *   - 資料館・城・営業中の店舗などは、その施設の時間に従う（＝要確認と明示）
 * 判定は access 欄の記述を第一の根拠にし、書かれていない場合だけ
 * category と名前から推定します。推定した場合は kind に guessed が立つので、
 * 画面側で「目安」と添えられます。
 *
 * 将来 data 側に hours 欄が増えたら、hoursOf() の先頭で spot.hours を見て
 * そのまま返すだけで、画面もプロンプトも変更せずに実データへ移行できます。
 */

export type VisitKind = "always" | "daytime" | "facility" | "unknown";

export type VisitWindow = {
  kind: VisitKind;
  /** 画面に出す短い見出し。例「時間の制限なし」 */
  label: string;
  /** 一文の補足。データに根拠がある場合はその文をそのまま使う。 */
  detail: string;
  /** access 欄ではなく category からの推定か。true なら「目安」と表示する。 */
  guessed: boolean;
  /** 夕方以降に組み込むと閉まっている可能性がある場所か。 */
  timeSensitive: boolean;
};

/** access 欄に「常時見学可能」のようにはっきり書かれている場合。 */
const ALWAYS_RE =
  /常時|随時|いつでも|24時間|自由に(参拝|見学|拝観)|見学(は)?(無料・?)?自由|参拝自由|自由に見学|見学可能な屋外/;

/** 逆に、施設の時間に従うと書かれている場合。 */
const FACILITY_RE =
  /開館|閉館|休館|営業|拝観時間|開園|閉園|予約|入館|一時閉館|工事のため/;

/** 屋外にあり、囲いも受付もないことが名前や分類から明らかなもの。 */
const OUTDOOR_RE =
  /跡|碑|塔|墓|古墳|遺跡|遺構|貝塚|樹|木$|松|桜|ザクラ|イチョウ|クス|楠|椎|アコウ|ソテツ|橋|石|岩|磨崖仏|地蔵|道標|井戸|名勝|景勝|渚|海岸|公園|展望|自然|天然記念物|被爆樹木|山$|島$|城跡|墳|園地/;

/** 受付や営業時間のある建物。 */
const FACILITY_WORD_RE =
  /博物館|美術館|資料館|記念館|時遊館|気象館|百貨店|本店|料亭|旅館|ホテル|銀行|学校|大学|講堂|医院|病院|庁舎|城$|城郭|天守|店$/;

/** 境内・参道。日中が目安で、門を閉める寺社もある。 */
const PRECINCT_RE = /寺|神社|神宮|大社|東照宮|八幡|天満宮|稲生|宮$|院$|堂$|庭園|境内/;

/** 名前と分類を別々に見る。「鹿持雅澄邸跡 文化財」のように連結すると
 *  「跡$」のような行末指定が効かなくなるため。 */
function matches(re: RegExp, spot: Pick<Spot, "name" | "category">): boolean {
  return re.test(spot.name) || re.test(spot.category);
}

function firstSentenceAbout(access: string, re: RegExp): string | null {
  const sentences = access
    .split(/(?<=。)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.find((s) => re.test(s)) ?? null;
}

export function hoursOf(spot: Pick<Spot, "name" | "category" | "access">): VisitWindow {
  const access = (spot.access ?? "").trim();

  // 1. データにはっきり書かれている場合は、その文をそのまま根拠にする。
  if (access) {
    const facilitySentence = firstSentenceAbout(access, FACILITY_RE);
    if (facilitySentence) {
      return {
        kind: "facility",
        label: "施設の時間内",
        detail: facilitySentence,
        guessed: false,
        timeSensitive: true,
      };
    }
    const alwaysSentence = firstSentenceAbout(access, ALWAYS_RE);
    if (alwaysSentence) {
      return {
        kind: "always",
        label: "時間の制限なし",
        detail: alwaysSentence,
        guessed: false,
        timeSensitive: false,
      };
    }
  }

  // 2. 書かれていない場合だけ、分類から推定する（必ず「目安」と表示される）。
  if (matches(FACILITY_WORD_RE, spot)) {
    return {
      kind: "facility",
      label: "施設の時間内",
      detail: "受付や営業時間があります。訪問前に公式の案内で確認してください。",
      guessed: true,
      timeSensitive: true,
    };
  }
  if (matches(PRECINCT_RE, spot)) {
    return {
      kind: "daytime",
      label: "日中の参拝時間",
      detail: "境内は日中の参拝が目安です。夕方に門を閉める場合があります。",
      guessed: true,
      timeSensitive: true,
    };
  }
  if (matches(OUTDOOR_RE, spot)) {
    return {
      kind: "always",
      label: "時間の制限なし",
      detail: "屋外にあり、時間を問わず見学できます（夜間は足元にご注意ください）。",
      guessed: true,
      timeSensitive: false,
    };
  }
  return {
    kind: "unknown",
    label: "時間は要確認",
    detail: "見学できる時間が公開されていません。現地または公式の案内で確認してください。",
    guessed: true,
    timeSensitive: true,
  };
}

/** プロンプトに載せる一行。営業時間そのものではなく「扱い方」を渡す。 */
export function hoursForPrompt(spot: Pick<Spot, "name" | "category" | "access">): string {
  const w = hoursOf(spot);
  if (w.kind === "always") return "屋外・時間の制限なし";
  if (w.kind === "daytime") return "寺社の境内・日中のみ（目安）";
  if (w.kind === "facility") return "施設の開館/営業時間内のみ・要確認";
  return "見学時間が不明・要確認";
}

/**
 * 「17時を過ぎる行程に、時間の決まった場所が入っている」ときだけ注意を出す。
 * いつでも出す注意書きは読まれなくなるので、条件を満たしたときだけ返す。
 */
export function lateWarning(
  spots: Pick<Spot, "name" | "category" | "access">[],
  endsAtMinutes: number,
): string | null {
  const risky = spots.filter((s) => hoursOf(s).timeSensitive);
  if (!risky.length) return null;
  if (endsAtMinutes < 17 * 60) return null;
  const names = risky.slice(0, 3).map((s) => s.name).join("・");
  return `夕方以降になります。${names}${risky.length > 3 ? "など" : ""}は開いている時間が決まっているため、先に回るか、時間を確認してから向かってください。`;
}
