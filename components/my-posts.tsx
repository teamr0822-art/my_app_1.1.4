"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePost } from "@/lib/post-context";
import { useToast } from "@/lib/toast-context";
import { fetchMyPosts, deletePost, KIND_LABEL, ROLE_LABEL, type Post, type Role } from "@/lib/supabase";
import { getSpot } from "@/lib/spots";

/**
 * 「わたしの投稿」と「投稿者の属性」。
 *
 * 投稿はいま集めるだけなので、送った本人にだけ履歴を見せる。送ったのに何も
 * 起きないと、壊れているのか届いていないのか分からないため。
 */

export function ContributorCard() {
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
            {post.roleLabel ?? ROLE_LABEL[post.role as Role]}
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-ink-soft)]">
            {post.role === "general"
              ? "合言葉を入れると、協力隊や企業、公式の情報提供者として投稿できます。"
              : "投稿にこの肩書きが付きます。"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-h-11 shrink-0 rounded-xl border border-[var(--color-border)] px-3 text-[13px] font-bold"
        >
          {post.role === "general" ? "合言葉を入れる" : "変更"}
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
              placeholder="配られた合言葉"
              aria-label="合言葉"
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
      toast("投稿を取り消しました");
    } catch (e) {
      toast(e instanceof Error ? e.message : "取り消せませんでした");
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <p className="text-[15px] font-extrabold">わたしの投稿</p>
      <p className="mt-0.5 text-[12px] leading-5 text-[var(--color-ink-soft)]">
        送った内容は、確かめたうえで地図に反映します。まだ地図には出ていません。
      </p>

      {error && <p className="mt-3 text-[12px] font-bold text-[var(--color-sunset-ink)]">{error}</p>}

      {posts === null && !error && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-soft)]">読み込んでいます…</p>
      )}

      {posts?.length === 0 && (
        <p className="mt-3 text-[13px] text-[var(--color-ink-soft)]">
          まだありません。スポットの画面や、マップの「＋場所を教える」から送れます。
        </p>
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
                    {KIND_LABEL[p.kind]}
                    {spot ? `：${spot.name}` : p.title ? `：${p.title}` : ""}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                    {when.getMonth() + 1}月{when.getDate()}日
                    {p.rating ? `・★${p.rating}` : ""}
                    {p.photoPaths?.length ? `・写真${p.photoPaths.length}枚` : ""}
                    {p.status === "pending" ? "・確認待ち" : p.status === "accepted" ? "・採用" : "・見送り"}
                  </p>
                  {p.body && (
                    <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[var(--color-ink-soft)]">{p.body}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="min-h-11 shrink-0 px-2 text-[12px] font-bold text-[var(--color-ink-soft)]"
                >
                  取り消す
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
