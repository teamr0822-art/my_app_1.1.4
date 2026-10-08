/**
 * 画面に出す「見本」の入り切り。
 *
 * ■ これは何か
 * ログインしていない人や、まだ一度も歩いていない人の画面は、記録が1件もない
 * ので「0件」「0m」が並ぶだけになる。何が記録されるのか分からないまま終わって
 * しまうため、作りもののデータで中身を見せている。
 *
 * ■ 消したくなったら
 * この1行を false にすれば、見本はすべて消える。
 *
 *     export const SHOW_SAMPLES = false;
 *
 * 消えるのは次の2か所。どちらも「見本」の札と破線の枠が付いているところ。
 *   - 設定 →「歩いた距離」（ログインしていないとき）
 *   - 設定 →「訪れた記録」（まだ0か所のとき）
 * 本物の記録の描き方には一切触れていないので、false にしても他の表示は変わらない。
 */
export const SHOW_SAMPLES = true;

/** 見本に使うスポットの id。実在するものを使い、見つからなければ黙って省く。 */
export const SAMPLE_VISITED_IDS = [
  "matsue-castle",
  "matsue-koizumi-yakumo-kyukyo",
  "matsue-senjuin-shidarezakura",
] as const;

/** 見本の訪問日（きょうから何日前か）。固定の日付にすると、いつ見ても古くなる。 */
export const SAMPLE_VISITED_DAYS_AGO = [0, 2, 5] as const;
