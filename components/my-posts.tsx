"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePost } from "@/lib/post-context";
import { useToast } from "@/lib/toast-context";
import { fetchMyPosts, deletePost, KIND_LABEL, ROLE_LABEL, type Post, type Role } from "@/lib/supabase";
import { getSpot } from "@/lib/spots";
import { useT } from "@/lib/i18n";
import { rankFor } from "@/lib/contributor-rank";

/**
 * 「わたしの投稿」と「投稿者の属性」。
 *
 * 投稿はいま集めるだけなので、送った本人にだけ履歴を見せる。送ったのに何も
 * 起きないと、壊れているのか届いていないのか分からないため。
 */

export function ContributorCard() {
  const t = useT();
  const auth = useAuth();
  const post = usePost();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.status !== "signedIn") return null;

  const submit = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    const result = await post.claimRole(code.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setCode("");
    setOpen(false);
    toast(`${result.label}として登録しました`);
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold">
            {post.roleLabel ?? t(ROLE_LABEL[post.role as Role])}
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-ink-soft)]">
            {post.role === "general"
              ? t("合言葉を入れると、協力隊や企業、公式の情報提供者として投稿できます。")
              : t("投稿にこの肩書きが付きます。")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 shrink-0 rounded-xl border border-[var(--color-border)] px-3 text-[13px] font-bold"
        >
          {post.role === "general" ? t("合言葉を入れる") : t("変更")}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              autoCapitalize="off"
              autoComplete="off"
              placeholder={t("配られた合言葉")}
              aria-label={t("合言葉")}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 text-[16px] outline-none focus:border-[var(--color-terracotta)]"
            />
            <button
              type="button"
              onClick={submit}
              aria-disabled={busy}
              className="min-h-12 shrink-0 rounded-xl bg-[var(--color-terracotta)] px-4 text-[14px] font-bold text-white aria-disabled:opacity-60"
            >
              {busy ? "確認中…" : "登録"}
            </button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[12px] font-bold text-[var(--color-sunset-ink)]">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MyPostsCard() {
  const t = useT();
  const auth = useAuth();
  const post = usePost();
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== "signedIn") {
      setPosts(null);
      return;
    }
    let cancelled = false;
    fetchMyPosts()
      .then((rows) => {
        if (!cancelled) {
          setPosts(rows);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "読み込めませんでした。");
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status, post.postedAt]);

  if (auth.status !== "signedIn") return null;

  const remove = async (id: string) => {
    try {
      await deletePost(id);
      setPosts((p) => (p ?? []).filter((x) => x.id !== id));
      toast(t("投稿を取り消しました"));
    } catch (e) {
      toast(e instanceof Error ? e.message : "取り消せませんでした");
    }
  };

  const rank = rankFor(post.postCount);

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <p className="text-[15px] font-extrabold">{t("わたしの投稿")}</p>
      <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-ink-soft)]">{t("送った内容は、確かめたうえで地図に反映します。まだ地図には出ていません。")}</p>

      {/*
        称号と、地図に入った件数。
        称号は送った数で上がる（押した手応え）、採用数は確かめ終わった数
        （本当に誇れる数字）。別の行に分けて、取り違えないようにする。
      */}
      {post.postCount > 0 ? (
        <div className="mt-3 rounded-2xl bg-[var(--color-panel-soft)] p-3">
          <div className="flex items-center gap-2">
            {rank.crown && (
              <span aria-hidden="true" className="text-[22px] leading-none">{rank.crown}</span>
            )}
            <div className="min-w-0 flex-1">
              {rank.title && (
                <p className="text-[14px] font-extrabold text-[var(--color-terracotta)]">
                  {t(rank.title)}
                </p>
              )}
              <p className="text-[12px] text-[var(--color-ink-soft)]">
                {t("送った投稿 {n}件", { n: post.postCount })}
                {post.acceptedCount > 0 && (
                  <>
                    {" ／ "}
                    <span className="font-bold text-[var(--color-green)]">
                      {t("地図に入った {n}件", { n: post.acceptedCount })}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          {rank.remaining !== null && rank.remaining > 0 && (
            <p className="mt-2 text-[11.5px] text-[var(--color-ink-soft)]">
              {t("あと{n}件で、次の称号です。", { n: rank.remaining })}
            </p>
          )}
        </div>
      ) : (
        /* まだ1件も送っていない人へ。ここが投稿の入口の説明も兼ねる。 */
        <div className="mt-3 rounded-2xl border border-dashed border-[var(--color-terracotta)] bg-[var(--color-terracotta-soft)] p-3">
          <p className="text-[14px] font-extrabold leading-snug text-[var(--color-terracotta)] text-balance">
            {t("あなたの“みっけ”が、次の人の寄り道になる。")}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[var(--color-ink-soft)]">
            {t("歩いた人しか知らないことは、まだ地図に入っていません。1件からで大丈夫です。")}
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-[12px] font-bold text-[var(--color-sunset-ink)]">{error}</p>}

      {posts === null && !error && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-soft)]">{t("読み込んでいます…")}</p>
      )}

      {posts?.length === 0 && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-soft)]">{t("まだありません。スポットの画面や、マップの「＋場所を教える」から送れます。")}</p>
      )}

      {posts && posts.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {posts.map((p) => {
            const spot = p.targetSpotId ? getSpot(p.targetSpotId) : null;
            const when = new Date(p.created_at);
            return (
              <li key={p.id} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold">
                    {t(KIND_LABEL[p.kind])}
                    {spot ? `：${spot.name}` : p.title ? `：${p.title}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                    {when.getMonth() + 1}月{when.getDate()}日
                    {p.rating ? `・★${p.rating}` : ""}
                    {p.photoPaths?.length ? `・写真${p.photoPaths.length}枚` : ""}
                    ・{p.status === "pending" ? t("確認待ち") : p.status === "accepted" ? t("採用") : t("見送り")}
                  </p>
                  {p.body && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-ink-soft)]">{p.body}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="min-h-11 shrink-0 px-2 text-[12px] font-bold text-[var(--color-ink-soft)]"
                >{t("取り消す")}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
