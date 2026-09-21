"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * ログイン（任意）。
 *
 * ■ 方針
 * このアプリは Google マップと同じく、ログインしなくても全部の機能が使える。
 * ログインは「あとで足す機能（訪問記録の引き継ぎなど）」のための入口で、
 * ログインしていないことを理由に何かを止めることはしない。
 *
 * ■ しくみ
 * 認証は Supabase Auth を使う。ライブラリ（@supabase/supabase-js）は入れず、
 * 公開されている REST API を fetch で直接呼ぶ。依存を増やすと pnpm-lock.yaml
 * の更新が要り、GitHub の Web 画面からの更新では事故が起きやすいため。
 *
 * Vercel の環境変数に次の2つが入っていないときは「準備中」と表示するだけで、
 * アプリの他の部分には一切影響しない。
 *   NEXT_PUBLIC_SUPABASE_URL       例: https://xxxx.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  Supabase の「anon / publishable」キー
 *
 * ログイン状態（アクセストークン）はこの端末の localStorage にだけ保存する。
 */

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

/** 環境変数がそろっていて、ログインを使える状態か。 */
export const AUTH_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_KEY);

const STORAGE_KEY = "yorimikke-session-v1";
/** 期限の何秒前にトークンを更新するか。 */
const REFRESH_MARGIN_S = 120;

export type AuthUser = {
  id: string;
  email: string;
  /** 新規登録のときに入れてもらう表示名。未入力ならメールの @ より前。 */
  name: string;
};

type Session = {
  accessToken: string;
  refreshToken: string;
  /** UNIX 秒 */
  expiresAt: number;
  user: AuthUser;
};

export type AuthStatus = "loading" | "signedOut" | "signedIn";

export type AuthResult =
  | { ok: true; needsConfirmation?: boolean }
  | { ok: false; message: string };

type AuthState = {
  configured: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, name: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** ログイン／新規登録の画面を開く（どの画面からでも呼べる）。 */
  openAuth: (mode: AuthMode) => void;
  closeAuth: () => void;
  authMode: AuthMode | null;
};

export type AuthMode = "signIn" | "signUp";

const AuthContext = createContext<AuthState | null>(null);

/* ------------------------------------------------------------------ */
/* Supabase Auth REST                                                   */
/* ------------------------------------------------------------------ */

type RawUser = {
  id: string;
  email?: string;
  user_metadata?: { display_name?: string; name?: string };
};

type RawSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  user: RawUser;
};

function toUser(raw: RawUser): AuthUser {
  const email = raw.email ?? "";
  const name = raw.user_metadata?.display_name || raw.user_metadata?.name || email.split("@")[0] || "ゲスト";
  return { id: raw.id, email, name };
}

function toSession(raw: RawSession): Session {
  const now = Math.floor(Date.now() / 1000);
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: raw.expires_at ?? now + (raw.expires_in ?? 3600),
    user: toUser(raw.user),
  };
}

async function authFetch(path: string, body?: unknown, token?: string): Promise<{ ok: boolean; data: unknown }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Authorization: `Bearer ${token ?? SUPABASE_KEY}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { msg: "__network__" } };
  }
}

/** Supabase のエラー文を、画面に出せる日本語にする。 */
function toMessage(data: unknown): string {
  const d = (data ?? {}) as { msg?: string; message?: string; error_description?: string; error?: string; error_code?: string; code?: string };
  const raw = d.msg || d.message || d.error_description || d.error || "";
  const code = d.error_code || d.code || "";
  const m = `${code} ${raw}`.toLowerCase();
  if (raw === "__network__") return "通信できませんでした。電波の良い場所でもう一度お試しください。";
  if (m.includes("invalid login") || m.includes("invalid_credentials")) return "メールアドレスかパスワードが違います。";
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed"))
    return "メールアドレスの確認がまだです。届いたメールのリンクを押してから、もう一度ログインしてください。";
  if (m.includes("already registered") || m.includes("user_already_exists") || m.includes("email_exists"))
    return "このメールアドレスは登録済みです。「ログイン」からお入りください。";
  if (m.includes("password") && (m.includes("at least") || m.includes("weak") || m.includes("short")))
    return "パスワードが短すぎるか、簡単すぎます。8文字以上で、英字と数字を混ぜてください。";
  if (m.includes("invalid") && m.includes("email")) return "メールアドレスの形が正しくありません。";
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit") || m.includes("too many"))
    return "短い時間に何度も試したため、少し待つ必要があります。しばらくしてからお試しください。";
  if (m.includes("signup") && m.includes("disabled")) return "いまは新規登録を受け付けていません。";
  return "うまくいきませんでした。時間をおいてもう一度お試しください。";
}

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function save(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 保存できなくても、このタブの間はログインしたまま使える */
  }
}

/**
 * 確認メールのリンクから戻ってきたとき、URL の # にトークンが付いてくる。
 * それを読み取ってログイン状態にし、URL からは消す（共有で漏れないように）。
 */
function sessionFromUrlHash(): Session | null {
  if (typeof window === "undefined" || !window.location.hash.includes("access_token=")) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;
  const expiresAt = Number(params.get("expires_at")) || Math.floor(Date.now() / 1000) + Number(params.get("expires_in") || 3600);
  history.replaceState(null, "", window.location.pathname + window.location.search);
  // ユーザー情報は後で /user から取り直す。ここでは仮の値を入れておく。
  return { accessToken, refreshToken, expiresAt, user: { id: "", email: "", name: "" } };
}

/* ------------------------------------------------------------------ */
/* Provider                                                             */
/* ------------------------------------------------------------------ */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(AUTH_CONFIGURED ? "loading" : "signedOut");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const refreshing = useRef<Promise<Session | null> | null>(null);

  const apply = useCallback((next: Session | null) => {
    setSession(next);
    save(next);
    setStatus(next ? "signedIn" : "signedOut");
  }, []);

  const refresh = useCallback(async (current: Session): Promise<Session | null> => {
    if (!refreshing.current) {
      refreshing.current = (async () => {
        const r = await authFetch("/token?grant_type=refresh_token", { refresh_token: current.refreshToken });
        if (r.ok) return toSession(r.data as RawSession);
        // 圏外で更新できなかっただけなら、手元の情報でログインしたまま扱う。
        const network = (r.data as { msg?: string } | null)?.msg === "__network__";
        return network ? current : null;
      })().finally(() => {
        refreshing.current = null;
      });
    }
    return refreshing.current;
  }, []);

  // 起動時: 確認メールから戻ってきたか → 保存済みのログイン → どちらもなし
  useEffect(() => {
    if (!AUTH_CONFIGURED) return;
    let cancelled = false;
    (async () => {
      const fromUrl = sessionFromUrlHash();
      let current = fromUrl ?? load();
      if (!current) {
        if (!cancelled) apply(null);
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      if (current.expiresAt - now < REFRESH_MARGIN_S) current = await refresh(current);
      if (current && !current.user.id) {
        const u = await authFetch("/user", undefined, current.accessToken);
        current = u.ok ? { ...current, user: toUser(u.data as RawUser) } : null;
      }
      if (!cancelled) apply(current);
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, refresh]);

  // 開いたままでもログインが切れないよう、期限の少し前に更新する。
  useEffect(() => {
    if (!session) return;
    const wait = Math.max(10, session.expiresAt - Math.floor(Date.now() / 1000) - REFRESH_MARGIN_S) * 1000;
    const timer = setTimeout(async () => {
      apply(await refresh(session));
    }, wait);
    return () => clearTimeout(timer);
  }, [session, apply, refresh]);

  const signIn = useCallback<AuthState["signIn"]>(
    async (email, password) => {
      if (!AUTH_CONFIGURED) return { ok: false, message: "ログイン機能は準備中です。" };
      const r = await authFetch("/token?grant_type=password", { email: email.trim(), password });
      if (!r.ok) return { ok: false, message: toMessage(r.data) };
      apply(toSession(r.data as RawSession));
      return { ok: true };
    },
    [apply],
  );

  const signUp = useCallback<AuthState["signUp"]>(
    async (email, password, name) => {
      if (!AUTH_CONFIGURED) return { ok: false, message: "ログイン機能は準備中です。" };
      const r = await authFetch("/signup", {
        email: email.trim(),
        password,
        data: { display_name: name.trim() },
      });
      if (!r.ok) return { ok: false, message: toMessage(r.data) };
      const d = r.data as Partial<RawSession> & RawUser;
      // メール確認が有効な設定では、ここではまだログインにならない。
      if (d.access_token && d.refresh_token && d.user) {
        apply(toSession(d as RawSession));
        return { ok: true };
      }
      return { ok: true, needsConfirmation: true };
    },
    [apply],
  );

  const signOut = useCallback(async () => {
    const token = session?.accessToken;
    apply(null);
    // サーバー側の取り消しは失敗しても構わない（端末からは既に消えている）。
    if (token && AUTH_CONFIGURED) await authFetch("/logout", {}, token);
  }, [session, apply]);

  const openAuth = useCallback((mode: AuthMode) => setAuthMode(mode), []);
  const closeAuth = useCallback(() => setAuthMode(null), []);

  const value = useMemo<AuthState>(
    () => ({
      configured: AUTH_CONFIGURED,
      status,
      user: session?.user ?? null,
      signIn,
      signUp,
      signOut,
      openAuth,
      closeAuth,
      authMode,
    }),
    [status, session, signIn, signUp, signOut, openAuth, closeAuth, authMode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth は AuthProvider の内側で使ってください");
  return ctx;
}
