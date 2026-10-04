"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchProfile, claimRole as claimRoleApi, countMyPosts, type Role } from "@/lib/supabase";
import type { PostKind } from "@/lib/supabase";

/**
 * 投稿まわりの入れ物。
 *
 * ここが持つのは2つだけ。
 *   1. いまログインしている人の属性（一般／協力隊／企業／公式）
 *   2. どの投稿画面を開いているか
 *
 * 投稿そのものの送信は lib/supabase.ts が行い、この文脈は「開く・閉じる」と
 * 「属性」の面倒だけを見る。
 */

export type PostRequest = {
  kind: PostKind;
  /** 従来スポットへの投稿のときだけ。 */
  spotId?: string;
  spotName?: string;
};

type PostState = {
  /** いまの属性。ログインしていないときは general。 */
  role: Role;
  /** 合言葉で付いた肩書き（例: 松江市地域おこし協力隊）。 */
  roleLabel: string | null;
  /** 合言葉を入れて属性を付ける。 */
  claimRole: (code: string) => Promise<{ ok: true; label: string } | { ok: false; message: string }>;
  request: PostRequest | null;
  openPost: (request: PostRequest) => void;
  closePost: () => void;
  /** 投稿が1つ増えたことを知らせる（一覧の作り直し用）。 */
  postedAt: number;
  notePosted: () => void;
  /** これまでに送った件数。称号の段はこれで上がる。 */
  postCount: number;
  /** そのうち、確かめて地図に反映した件数。 */
  acceptedCount: number;
};

const PostContext = createContext<PostState | null>(null);

export function PostProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [role, setRole] = useState<Role>("general");
  const [roleLabel, setRoleLabel] = useState<string | null>(null);
  const [request, setRequest] = useState<PostRequest | null>(null);
  const [postedAt, setPostedAt] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);

  // ログインしたら属性を読みに行く。失敗しても一般として使えるので、黙って諦める。
  useEffect(() => {
    if (auth.status !== "signedIn") {
      setRole("general");
      setRoleLabel(null);
      return;
    }
    let cancelled = false;
    fetchProfile()
      .then((p) => {
        if (!cancelled && p?.role) setRole(p.role);
      })
      .catch(() => {
        /* データベースの準備がまだのときもここに来る。一般として続ける。 */
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  /**
   * 件数を数え直す。ログインしたときと、投稿を送ったあと。
   * 失敗しても黙って0のままにする（称号が出ないだけで、投稿自体はできる）。
   */
  useEffect(() => {
    if (auth.status !== "signedIn") {
      setPostCount(0);
      setAcceptedCount(0);
      return;
    }
    let cancelled = false;
    countMyPosts()
      .then((c) => {
        if (cancelled) return;
        setPostCount(c.total);
        setAcceptedCount(c.accepted);
      })
      .catch(() => {
        /* 数えられなくても投稿はできる */
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status, postedAt]);

  const claimRole = useCallback<PostState["claimRole"]>(async (code) => {
    try {
      const hit = await claimRoleApi(code);
      setRole(hit.role);
      setRoleLabel(hit.label);
      return { ok: true, label: hit.label ?? hit.role };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "合言葉が違います。" };
    }
  }, []);

  const value = useMemo<PostState>(
    () => ({
      role,
      roleLabel,
      claimRole,
      request,
      openPost: (r) => setRequest(r),
      closePost: () => setRequest(null),
      postedAt,
      notePosted: () => setPostedAt(Date.now()),
      postCount,
      acceptedCount,
    }),
    [role, roleLabel, claimRole, request, postedAt, postCount, acceptedCount],
  );

  return <PostContext.Provider value={value}>{children}</PostContext.Provider>;
}

export function usePost(): PostState {
  const ctx = useContext(PostContext);
  if (!ctx) throw new Error("usePost は PostProvider の内側で使ってください");
  return ctx;
}
