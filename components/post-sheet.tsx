"use client";

import { useEffect, useRef, useState } from "react";
import { rankFor, didRankUp, type RankTone } from "@/lib/contributor-rank";
import { usePost } from "@/lib/post-context";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "@/lib/location-context";
import { useToast } from "@/lib/toast-context";
import { createPost, uploadPhoto, ROLE_LABEL, type PostKind } from "@/lib/supabase";
import { CloseIcon } from "@/components/icons";
import { useT } from "@/lib/i18n";

/**
 * 投稿の画面。4種類を1つの画面でまかなう。
 *
 *   new_spot … まだ載っていない場所を教えてもらう
 *   review   … 従来のスポットへの口コミ
 *   report   … 従来のスポットへの通報（情報が違う・立入禁止など）
 *   photo    … 写真だけ送る
 *
 * 投稿はいまのところ「集めるだけ」で、地図には出ない。どう使うかを決めるのは
 * あとなので、画面にもそう書いておく（送ったのに出てこない、と誤解されないため）。
 *
 * 写真は縮めてから送り、本文は必須にしない。外で片手で使う前提で、入力は最小限。
 */

const CATEGORIES = ["史跡", "神社・寺", "自然・景色", "食べ物", "休憩できる場所", "その他"];

/** アプリへの意見の種類。細かく分けすぎると選ぶのが面倒になるので4つだけ。 */
const FEEDBACK_KINDS = ["使いにくいところ", "ほしい機能", "うまく動かない", "そのほか"];

/**
 * 通報の種類。
 *
 * 先頭の「近隣の迷惑〜」が、この機能のいちばんの目的。
 * 住んでいる人が来てほしくない場所を見つけて、一覧から外すために使う。
 * 以前はこの項目が無く、「立入禁止・閉鎖している」（＝物理的に閉まっている）
 * とも違うので、いちばん大事な通報が「その他」に埋もれていた。
 */
const REPORT_REASONS = [
  "近隣の迷惑になっている・住宅がすぐそば",
  "情報がまちがっている",
  "立入禁止・閉鎖している",
  "危険な場所がある",
  "写真・内容が不適切",
  "その他",
];

/** 写真は端末の負担と通信量を考えて、1回3枚まで。 */
const MAX_PHOTOS = 3;

export function PostSheet() {
  const post = usePost();
  if (!post.request) return null;
  return <PostForm key={`${post.request.kind}-${post.request.spotId ?? ""}`} />;
}

function PostForm() {
  const t = useT();
  const post = usePost();
  const auth = useAuth();
  const geo = useLocation();
  const { toast } = useToast();
  const request = post.request!;
  const kind: PostKind = request.kind;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [address, setAddress] = useState("");
  const [rating, setRating] = useState(0);
  const [reason, setReason] = useState(kind === "feedback" ? FEEDBACK_KINDS[0] : REPORT_REASONS[0]);
  /**
   * 写真を出してよいか、本人に確かめた印。
   *
   * 権利の確認は、あとから遡れない。他人の写真が混ざったまま集めてしまうと、
   * 集めた分がまるごと使えなくなる。文章を書き添えるだけでは「読んでいない」
   * ことにできてしまうので、写真を付けたときだけ、はっきり押してもらう。
   */
  const [photoOk, setPhotoOk] = useState(false);
  /** 送る直前の件数。称号が上がったかどうかは、これと比べて決める。 */
  const countBefore = useRef(0);
  const [facilities, setFacilities] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** 新しい場所の位置。開いた時点の現在地を初期値にする。 */
  const [spotPos, setSpotPos] = useState<[number, number] | null>(geo.fix);
  const firstField = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) post.closePost();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [post, busy]);

  const heading =
    kind === "new_spot"
      ? t("新しい場所を教える")
      : kind === "review"
        ? t("口コミを書く")
        : kind === "report"
          ? t("まちがい・危険を知らせる")
          : kind === "feedback"
            ? t("アプリへの意見を送る")
            : t("写真を送る");

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    setPhotos((current) => [...current, ...Array.from(files)].slice(0, MAX_PHOTOS));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (kind === "new_spot") {
      if (!title.trim()) return setError(t("場所の名前を入れてください。"));
      if (!spotPos) return setError(t("位置が分かりません。現在地を許可するか、あとで場所の近くで投稿してください。"));
    }
    if (kind === "review" && !body.trim() && rating === 0) {
      return setError(t("星か、ひとことを入れてください。"));
    }
    if (kind === "report" && !body.trim()) return setError(t("どこがおかしいかを書いてください。"));
    if (kind === "feedback" && !body.trim()) return setError(t("ご意見を書いてください。"));
    if (kind === "photo" && photos.length === 0) return setError(t("写真を選んでください。"));
    if (photos.length > 0 && !photoOk) {
      return setError(t("写真については、自分で撮ったものであることの確認をお願いします。"));
    }

    setBusy(true);
    try {
      const paths: string[] = [];
      for (const file of photos) paths.push(await uploadPhoto(file));
      await createPost({
        kind,
        targetSpotId: request.spotId ?? null,
        title: kind === "new_spot" ? title.trim() : request.spotName ?? null,
        body: body.trim() || null,
        lat: kind === "new_spot" ? spotPos?.[0] ?? null : geo.fix?.[0] ?? null,
        lng: kind === "new_spot" ? spotPos?.[1] ?? null : geo.fix?.[1] ?? null,
        address: address.trim() || null,
        category: kind === "new_spot" ? category : null,
        facilities,
        rating: kind === "review" && rating > 0 ? rating : null,
        reportReason: kind === "report" || kind === "feedback" ? reason : null,
        photoPaths: paths,
        authorRole: post.role,
      });
      countBefore.current = post.postCount;
      post.notePosted();
      setDone(true);
      toast(t("投稿を受け付けました"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "うまくいきませんでした。");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mt-1.5 block w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 py-3 text-[16px] outline-none focus:border-[var(--color-terracotta)]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="post-title"
      className="fixed inset-0 z-[950] flex items-end justify-center bg-black/45 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-8 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) post.closePost();
      }}
    >
      <div className="anim-sheet max-h-full w-full max-w-[432px] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="post-title" className="text-[19px] font-extrabold">
              {heading}
            </h2>
            {request.spotName && (
              <p className="mt-0.5 truncate text-[12px] text-[var(--color-ink-soft)]">
                {request.spotName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => post.closePost()}
            aria-label={t("閉じる")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-soft)]"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {auth.status !== "signedIn" ? (
          <div className="mt-3 space-y-3 text-[14px] leading-7">
            <p>{t("投稿にはログインが必要です。")}</p>
            <p className="text-[12px] text-[var(--color-ink-soft)]">{t("誰が出した情報かが分からないと、あとで使えないためです。")}</p>
            <button
              type="button"
              onClick={() => {
                post.closePost();
                auth.openAuth("signIn");
              }}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--color-terracotta)] text-[15px] font-bold text-white"
            >{t("ログインする")}</button>
          </div>
        ) : done ? (
          <ThankYou
            t={t}
            before={countBefore.current}
            after={post.postCount}
            accepted={post.acceptedCount}
            onClose={() => post.closePost()}
          />
        ) : (
          <form onSubmit={submit} noValidate className="mt-3">
            {/* いまどの立場で投稿するか。合言葉を入れた人はここに出る。 */}
            {post.role !== "general" && (
              <p className="mb-3 inline-flex items-center rounded-full bg-[var(--color-green-soft)] px-3 py-1 text-[12px] font-bold text-[var(--color-green)]">
                {t("{role}として投稿します", { role: post.roleLabel ?? t(ROLE_LABEL[post.role]) })}
              </p>
            )}

            {kind === "new_spot" && (
              <>
                <label className="block text-[13px] font-bold">
                  {t("場所の名前")}
                  <input
                    ref={firstField as React.RefObject<HTMLInputElement>}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={60}
                    placeholder={t("例：〇〇の石碑")}
                    className={field}
                  />
                </label>

                <label className="mt-4 block text-[13px] font-bold">
                  {t("どんな場所")}
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(c)}
                      </option>
                    ))}
                  </select>
                </label>

                {/* 位置。現在地をそのまま使うのがいちばん確実なので、それを基本にする。 */}
                <div className="mt-4 rounded-xl border border-[var(--color-border)] p-3">
                  <p className="text-[13px] font-bold">{t("場所")}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--color-ink-soft)]">
                    {spotPos
                      ? t("現在地を使います（{lat}, {lng}）", { lat: spotPos[0].toFixed(5), lng: spotPos[1].toFixed(5) })
                      : t("現在地が取れていません。その場所の近くで投稿してください。")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSpotPos(geo.fix);
                      if (!geo.fix) geo.retry();
                    }}
                    className="mt-2 min-h-11 rounded-xl border border-[var(--color-border)] px-3 text-[13px] font-bold"
                  >{t("いまの現在地に更新")}</button>
                </div>

                <label className="mt-4 block text-[13px] font-bold">
                  {t("住所や目印（任意）")}
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={120}
                    placeholder={t("例：松江市殿町 城の北側の坂の途中")}
                    className={field}
                  />
                </label>

                <fieldset className="mt-4">
                  <legend className="text-[13px] font-bold">{t("ここにあるもの（任意）")}</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[
                      ["parking", "駐車場"],
                      ["bicycle", "駐輪場"],
                      ["toilet", "トイレ"],
                      ["shelter", "雨宿りできる"],
                      ["bench", "座れる"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={Boolean(facilities[key])}
                        onClick={() => setFacilities((f) => ({ ...f, [key]: !f[key] }))}
                        className={`min-h-11 rounded-full border px-4 text-[13px] font-bold ${
                          facilities[key]
                            ? "border-[var(--color-green)] bg-[var(--color-green)] text-white"
                            : "border-[var(--color-border)] text-[var(--color-ink)]"
                        }`}
                      >
                        {t(label)}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}

            {kind === "review" && (
              <fieldset>
                <legend className="text-[13px] font-bold">{t("よかったところ")}</legend>
                <div className="mt-2 flex gap-1" role="radiogroup" aria-label={t("評価")}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`星${n}`}
                      onClick={() => setRating(n)}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl text-[22px] ${
                        n <= rating ? "text-[var(--color-sun)]" : "text-[var(--color-border)]"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {kind === "feedback" && (
              <label className="block text-[13px] font-bold">
                {t("どんなご意見ですか")}
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
                  {FEEDBACK_KINDS.map((r) => (
                    <option key={r} value={r}>
                      {t(r)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind === "report" && (
              <label className="block text-[13px] font-bold">
                {t("どうしましたか")}
                <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {t(r)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {kind !== "new_spot" && (
              <label className="mt-4 block text-[13px] font-bold">
                {kind === "report" ? t("くわしく") : kind === "feedback" ? t("ご意見") : t("ひとこと（任意）")}
                <textarea
                  ref={kind !== "photo" ? (firstField as React.RefObject<HTMLTextAreaElement>) : undefined}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder={
                    kind === "report"
                      ? t("例：門が閉まっていて中に入れませんでした")
                      : kind === "feedback"
                        ? t("例：文字が小さくて外だと読みにくいです")
                        : t("例：朝は人が少なくて静かでした")
                  }
                  className={`${field} resize-none`}
                />
              </label>
            )}

            {kind === "new_spot" && (
              <label className="mt-4 block text-[13px] font-bold">
                どんな場所か、ひとこと（任意）
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className={`${field} resize-none`}
                />
              </label>
            )}

            {/* 写真。使い道はこれから決めるので、いまは集めるだけ。 */}
            <div className="mt-4">
              <p className="text-[13px] font-bold">{t("写真（{n}枚まで・任意）", { n: MAX_PHOTOS })}</p>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => addPhotos(e.target.files)}
                className="mt-2 block w-full text-[12px] file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-[var(--color-border)] file:bg-[var(--color-panel-soft)] file:px-4 file:text-[13px] file:font-bold"
              />
              {photos.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {photos.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setPhotos((p) => p.filter((_, k) => k !== i))}
                        className="min-h-11 px-2 font-bold text-[var(--color-terracotta)]"
                      >{t("外す")}</button>
                    </li>
                  ))}
                </ul>
              )}

              {/* 写真を選んだときだけ出す。何も付けない人の手間は増やさない。 */}
              {photos.length > 0 && (
                <label className="mt-3 flex items-start gap-2.5 rounded-xl bg-[var(--color-panel-soft)] p-3">
                  <input
                    type="checkbox"
                    checked={photoOk}
                    onChange={(e) => setPhotoOk(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-terracotta)]"
                  />
                  <span className="text-[12px] font-bold leading-5">
                    {t("この写真は自分で撮ったもので、よりみっけに載せてもかまいません。")}
                    <span className="mt-1 block font-normal text-[var(--color-ink-soft)]">
                      {t("ほかの人が撮った写真や、ネットで見つけた写真は送らないでください。写っている人の顔や、表札・車のナンバーにもご注意ください。")}
                    </span>
                  </span>
                </label>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-[var(--color-sunset-soft)] px-3 py-2 text-[13px] leading-6 text-[var(--color-sunset-ink)]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              aria-disabled={busy}
              className="mt-5 flex min-h-13 w-full items-center justify-center rounded-2xl bg-[var(--color-terracotta)] py-3.5 text-[16px] font-bold text-white aria-disabled:opacity-60"
            >
              {busy ? t("送っています…") : t("送る")}
            </button>

            <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-soft)]">{t("投稿はいったん集めるだけで、すぐには地図に出ません。内容を確かめてから 反映します。個人が特定できる写真や、他人の敷地の中は避けてください。")}</p>
          </form>
        )}
      </div>
    </div>
  );
}

/** 称号の色を、CSS の変数に対応させる。 */
const TONE: Record<RankTone, { bg: string; ink: string; solid: string }> = {
  green: { bg: "var(--color-green-soft)", ink: "var(--color-green)", solid: "var(--color-green)" },
  sun: { bg: "var(--color-sun-soft)", ink: "var(--color-sun-ink)", solid: "var(--color-sun)" },
  terracotta: { bg: "var(--color-terracotta-soft)", ink: "var(--color-terracotta)", solid: "var(--color-terracotta)" },
  sunset: { bg: "var(--color-sunset-soft)", ink: "var(--color-sunset-ink)", solid: "var(--color-sunset)" },
};

/**
 * 送ったあとのお礼。
 *
 * ■ なぜ手をかけるか
 * 投稿は「送って終わり、あとは何も起きない」のがいちばん冷たい。とくにこの
 * アプリは、集めた投稿をその場で地図に出さない方針なので、送った人から見ると
 * 本当に何も変わらない。だから、変わったことを目に見える形で返す。
 * 返すのは件数と称号という、確かに本当のことだけにする。「反映しました」の
 * ような、まだ起きていないことは言わない。
 *
 * 動きは控えめにしている。文化財のアプリで紙吹雪が舞い続けると、この画面だけ
 * 別のアプリに見える。葉が数枚落ちて止まる程度。
 */
function ThankYou({
  t,
  before,
  after,
  accepted,
  onClose,
}: {
  t: (ja: string, vars?: Record<string, string | number>) => string;
  before: number;
  after: number;
  accepted: number;
  onClose: () => void;
}) {
  /*
   * 件数はサーバーに数え直してもらうが、その返事は少し遅れて届く。待っている
   * 間に「0件目です」と出すと、送ったことが無かったことにされたように見える。
   * いま1件送ったのは確実なので、少なくとも「前の数+1」として扱う。
   * 数え直しが失敗したときも、この値で正しく出る。
   */
  const count = Math.max(after, before + 1);
  const rank = rankFor(count);
  const rankedUp = didRankUp(before, count);
  const tone = TONE[rank.tone];

  return (
    <div className="mt-3">
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-center"
        style={{ background: tone.bg }}
      >
        <FallingLeaves tone={tone.solid} lively={rankedUp} />

        <p className="relative text-[26px] font-extrabold leading-tight" style={{ color: tone.ink }}>
          {t("ありがとう")}
        </p>
        <p className="relative mt-1 text-[13px] font-bold" style={{ color: tone.ink }}>
          {t("これで{n}件目のみっけです。", { n: count })}
        </p>

        {/* 称号が上がった回だけ、名前を大きく出す。毎回出すと、ただの飾りになる。 */}
        {rankedUp && rank.title && (
          <div
            className="anim-rankup relative mt-3 inline-flex items-center gap-2 rounded-full bg-[var(--color-panel)] px-4 py-2 shadow"
            style={{ color: tone.ink }}
          >
            <span aria-hidden="true" className="text-[20px]">{rank.crown}</span>
            <span className="text-[14px] font-extrabold">
              {t("「{title}」になりました", { title: t(rank.title) })}
            </span>
          </div>
        )}

        {!rankedUp && rank.title && (
          <p className="relative mt-2 text-[12px] font-bold" style={{ color: tone.ink }}>
            {rank.crown} {t(rank.title)}
          </p>
        )}

        {rank.remaining !== null && rank.remaining > 0 && (
          <p className="relative mt-2 text-[11.5px] text-[var(--color-ink-soft)]">
            {t("あと{n}件で、次の称号です。", { n: rank.remaining })}
          </p>
        )}
      </div>

      {/* 採用数は称号と分けて、静かに出す。こちらが本当に誇れる数字。 */}
      {accepted > 0 && (
        <p className="mt-3 rounded-xl bg-[var(--color-panel-soft)] px-3 py-2 text-[12.5px] font-bold text-[var(--color-green)]">
          {t("あなたの投稿のうち{n}件は、もう地図に入っています。", { n: accepted })}
        </p>
      )}

      <p className="mt-3 text-[12px] leading-6 text-[var(--color-ink-soft)]">
        {t("集まった投稿は、内容を確かめてから地図に反映します。いまはまだ地図には 出ません。送った内容は、設定画面の「わたしの投稿」で確認できます。")}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--color-terracotta)] text-[15px] font-bold text-white"
      >{t("閉じる")}</button>
    </div>
  );
}

/**
 * 落ち葉。装飾なので aria-hidden。
 * 数枚が落ちて、そこで止まる（繰り返さない）。称号が上がった回だけ枚数を増やす。
 */
function FallingLeaves({ tone, lively }: { tone: string; lively: boolean }) {
  const leaves = lively
    ? [8, 20, 32, 44, 56, 68, 80, 92]
    : [18, 42, 66, 88];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {leaves.map((x, i) => (
        <span
          key={x}
          className="anim-leaf absolute top-0 block h-2.5 w-2.5 rounded-[40%_60%_40%_60%]"
          style={{
            left: `${x}%`,
            background: tone,
            opacity: 0.75,
            animationDelay: `${i * 90}ms`,
          }}
        />
      ))}
    </span>
  );
}
