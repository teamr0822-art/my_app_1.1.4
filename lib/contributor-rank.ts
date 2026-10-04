/**
 * 投稿した人の称号。
 *
 * ■ 何を数えるか
 * 称号は「送った数」で上がる。送った瞬間に必ず変わるので、押した手応えが
 * その場で返る。一方「地図に反映された数」は別に数えて、称号とは分けて
 * 静かに出す（my-posts の画面）。
 *
 * この分け方には理由がある。反映の確認は人の手でやるので、採用の数だけを
 * 見せると、送った直後は誰でも0のままで「何も起きなかった」ように見える。
 * かといって送った数だけを称えると、数を稼ぐための薄い投稿を褒めることに
 * なる。だから、手応えは送った数で返し、誇れる数字は採用数で示す。
 *
 * ■ 競争にしない
 * 順位表は作らない。他人と比べさせると、このアプリがいちばん必要としている
 * 「ここは住んでいる人が来てほしくない場所です」のような、数にならない
 * 投稿が出てこなくなる。称号は本人にしか見えない。
 */

export type RankTone = "green" | "sun" | "terracotta" | "sunset";

export type Rank = {
  /** 0 は称号なし（まだ投稿していない）。 */
  level: number;
  /** 名前の前に付く印。level 0 では空。 */
  crown: string;
  /** 称号の名前。level 0 では空。 */
  title: string;
  /** お礼の画面の色。 */
  tone: RankTone;
  /** 次の称号に必要な件数。最高位なら null。 */
  next: number | null;
  /** 次の称号までの残り件数。最高位なら null。 */
  remaining: number | null;
};

/**
 * 段差の置き方。
 * 1件目はすぐ。そのあとは 3 → 10 → 30 と間隔を広げる。最初の1件を出すのが
 * いちばん重く、2件目からは軽いので、最初にいちばん大きな変化を置いている。
 */
const STEPS: { min: number; crown: string; title: string; tone: RankTone }[] = [
  { min: 0, crown: "", title: "", tone: "green" },
  { min: 1, crown: "🌱", title: "みっけびと", tone: "green" },
  { min: 3, crown: "🍁", title: "まちの目", tone: "sun" },
  { min: 10, crown: "🏮", title: "まちの語り部", tone: "terracotta" },
  { min: 30, crown: "👑", title: "よりみっけの主", tone: "sunset" },
];

export function rankFor(posts: number): Rank {
  const n = Math.max(0, Math.floor(posts));
  let index = 0;
  for (let i = 0; i < STEPS.length; i++) if (n >= STEPS[i].min) index = i;
  const step = STEPS[index];
  const upcoming = STEPS[index + 1] ?? null;
  return {
    level: index,
    crown: step.crown,
    title: step.title,
    tone: step.tone,
    next: upcoming?.min ?? null,
    remaining: upcoming ? Math.max(0, upcoming.min - n) : null,
  };
}

/** 今回の投稿で称号が上がったか。上がったときだけ、お礼を少し派手にする。 */
export function didRankUp(before: number, after: number): boolean {
  return rankFor(after).level > rankFor(before).level;
}
