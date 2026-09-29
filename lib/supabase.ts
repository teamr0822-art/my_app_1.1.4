"use client";

import { SUPABASE_KEY, SUPABASE_URL, AUTH_CONFIGURED, getAccessToken } from "@/lib/auth-context";

/**
 * Supabase のデータベース／ストレージを呼ぶための、最小限の道具。
 *
 * 公式のライブラリ（@supabase/supabase-js）は入れていない。依存を増やすと
 * pnpm-lock.yaml の更新が要り、GitHub の Web 画面からの更新では事故が起きやすい
 * ため。ここで使うのは公開されている REST API だけで、やることも
 * 「1行入れる」「自分の行を読む」「写真を1枚置く」の3つしかない。
 */

export class SupabaseError extends Error {}

function ensure(): void {
  if (!AUTH_CONFIGURED) throw new SupabaseError("この機能はまだ準備中です。");
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  if (!token) throw new SupabaseError("ログインが必要です。");
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
}

/** エラーの中身を、画面に出せる日本語にする。 */
function toMessage(status: number, data: unknown): string {
  const d = (data ?? {}) as { message?: string; hint?: string; error?: string };
  const raw = `${d.message ?? d.error ?? ""} ${d.hint ?? ""}`.toLowerCase();
  if (raw.includes("合言葉")) return "合言葉が違います。";
  if (raw.includes("ログインが必要")) return "ログインが必要です。";
  if (status === 401 || status === 403) return "権限がありません。ログインし直してください。";
  if (status === 404 || raw.includes("does not exist") || raw.includes("schema cache"))
    return "サーバー側の準備がまだです（データベースの設定を実行してください）。";
  if (status === 413 || raw.includes("too large")) return "写真が大きすぎます。";
  if (status >= 500) return "サーバーが混み合っています。しばらくしてからお試しください。";
  return "うまくいきませんでした。時間をおいてもう一度お試しください。";
}

async function request(path: string, init: RequestInit): Promise<unknown> {
  ensure();
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}${path}`, init);
  } catch {
    throw new SupabaseError("通信できませんでした。電波の良い場所でもう一度お試しください。");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) throw new SupabaseError(toMessage(res.status, data));
  return data;
}

/* ------------------------------------------------------------------ */
/* profiles                                                            */
/* ------------------------------------------------------------------ */

/** 投稿者の属性。合言葉を入れると一般以外になる。 */
export type Role = "general" | "kyoryokutai" | "company" | "official";

export const ROLE_LABEL: Record<Role, string> = {
  general: "一般",
  kyoryokutai: "地域おこし協力隊",
  company: "企業",
  official: "公式情報提供者",
};

export type Profile = { id: string; nickname: string | null; role: Role };

export async function fetchProfile(): Promise<Profile | null> {
  const headers = await authHeaders();
  const rows = (await request("/rest/v1/profiles?select=id,nickname,role&limit=1", {
    headers,
  })) as Profile[];
  return rows?.[0] ?? null;
}

/** ニックネームを保存する（サーバー側の関数を呼ぶ）。 */
export async function saveNickname(nickname: string): Promise<void> {
  const headers = await authHeaders();
  await request("/rest/v1/rpc/set_nickname", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_nickname: nickname }),
  });
}

/** 合言葉を入れて属性を付ける。合言葉そのものはアプリ側に保存しない。 */
export async function claimRole(code: string): Promise<{ role: Role; label: string | null }> {
  const headers = await authHeaders();
  const rows = (await request("/rest/v1/rpc/claim_contributor_role", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code }),
  })) as { role: Role; label: string | null }[];
  const hit = Array.isArray(rows) ? rows[0] : null;
  if (!hit) throw new SupabaseError("合言葉が違います。");
  return hit;
}

/* ------------------------------------------------------------------ */
/* posts                                                               */
/* ------------------------------------------------------------------ */

export type PostKind = "new_spot" | "review" | "report" | "photo" | "feedback";

export const KIND_LABEL: Record<PostKind, string> = {
  new_spot: "新しい場所",
  review: "口コミ",
  report: "通報",
  photo: "写真",
  feedback: "アプリへの意見",
};

export type NewPost = {
  kind: PostKind;
  /** 従来スポットへの投稿のときだけ。data/areas の id。 */
  targetSpotId?: string | null;
  title?: string | null;
  body?: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  category?: string | null;
  facilities?: Record<string, boolean>;
  rating?: number | null;
  reportReason?: string | null;
  photoPaths?: string[];
  authorRole?: Role;
};

export type Post = NewPost & {
  id: string;
  created_at: string;
  status: "pending" | "accepted" | "rejected";
};

export async function createPost(post: NewPost): Promise<void> {
  const headers = await authHeaders();
  const userId = await getUserId();
  await request("/rest/v1/posts", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: userId,
      kind: post.kind,
      target_spot_id: post.targetSpotId ?? null,
      title: post.title ?? null,
      body: post.body ?? null,
      lat: post.lat ?? null,
      lng: post.lng ?? null,
      address: post.address ?? null,
      category: post.category ?? null,
      facilities: post.facilities ?? {},
      rating: post.rating ?? null,
      report_reason: post.reportReason ?? null,
      photo_paths: post.photoPaths ?? [],
      author_role: post.authorRole ?? "general",
    }),
  });
}

/** 自分の投稿だけを新しい順に。他人の投稿はサーバー側の設定で読めない。 */
export async function fetchMyPosts(limit = 50): Promise<Post[]> {
  const headers = await authHeaders();
  const rows = (await request(
    `/rest/v1/posts?select=id,kind,target_spot_id,title,body,rating,report_reason,photo_paths,status,created_at&order=created_at.desc&limit=${limit}`,
    { headers },
  )) as (Post & { target_spot_id: string | null; report_reason: string | null; photo_paths: string[] })[];
  return (rows ?? []).map((r) => ({
    ...r,
    targetSpotId: r.target_spot_id,
    reportReason: r.report_reason,
    photoPaths: r.photo_paths,
  }));
}

export async function deletePost(id: string): Promise<void> {
  const headers = await authHeaders();
  await request(`/rest/v1/posts?id=eq.${id}`, { method: "DELETE", headers });
}

/* ------------------------------------------------------------------ */
/* 写真                                                                 */
/* ------------------------------------------------------------------ */

/** 1枚あたりの上限。これを超える写真は、送る前に縮める。 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
/** 長辺をこの大きさに縮める（スマホの写真はそのままだと数MBある）。 */
const MAX_EDGE = 1600;

/**
 * 写真を縮めてから送る。
 * 通信が細い屋外でも待たされないように、長辺1600pxの JPEG にする。
 */
export async function shrinkImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * 写真を1枚置いて、その場所（パス）を返す。
 * 置き場所は「自分のID/年月日-乱数.jpg」。他人のフォルダには置けない設定。
 */
export async function uploadPhoto(file: File): Promise<string> {
  const headers = await authHeaders();
  const userId = await getUserId();
  const blob = await shrinkImage(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new SupabaseError("写真が大きすぎます。");
  const name = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await request(`/storage/v1/object/post-photos/${name}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": blob.type || "image/jpeg" },
    body: blob,
  });
  return name;
}

/** 自分の写真を見るための、期限つきのURL（60分）。 */
export async function photoUrl(path: string): Promise<string | null> {
  try {
    const headers = await authHeaders();
    const data = (await request(`/storage/v1/object/sign/post-photos/${path}`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
    })) as { signedURL?: string };
    return data?.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL.replace(/^\/storage\/v1/, "")}` : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */

async function getUserId(): Promise<string> {
  const { getUserIdFromSession } = await import("@/lib/auth-context");
  const id = getUserIdFromSession();
  if (!id) throw new SupabaseError("ログインが必要です。");
  return id;
}
