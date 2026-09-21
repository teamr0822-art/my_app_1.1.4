"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth, type AuthMode } from "@/lib/auth-context";
import { useToast } from "@/lib/toast-context";
import { CloseIcon } from "@/components/icons";

/**
 * ログイン／新規登録の画面。どの画面からでも useAuth().openAuth("signIn") で開く。
 *
 * 外で歩きながら片手で入力する前提なので、入力欄とボタンは大きく、
 * 1画面に項目を最小限しか置かない（新規登録でも3つ）。
 */
export function AuthSheet() {
  const auth = useAuth();
  const mode = auth.authMode;
  if (!mode) return null;
  // key でモードごとに作り直し、前の入力やエラーを持ち越さない。
  return <AuthForm key={mode} mode={mode} />;
}

function AuthForm({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 新規登録のあと、確認メールを待っている状態。 */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  const signUp = mode === "signUp";
  const title = sentTo ? "確認メールを送りました" : signUp ? "新規登録" : "ログイン";

  useEffect(() => {
    firstField.current?.focus();
  }, []);

  // Esc で閉じる（キーボード利用者向け）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") auth.closeAuth();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [auth]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("メールアドレスを正しく入力してください。");
      return;
    }
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください。");
      return;
    }
    setBusy(true);
    const result = signUp ? await auth.signUp(email, password, name) : await auth.signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.needsConfirmation) {
      setSentTo(email.trim());
      return;
    }
    toast(signUp ? "登録しました。ようこそ！" : "ログインしました");
    auth.closeAuth();
  };

  const field =
    "mt-1.5 block min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3.5 text-[16px] outline-none focus:border-[var(--color-terracotta)]";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-title"
      className="fixed inset-0 z-[950] flex items-end justify-center bg-black/45 px-3 pb-[calc(12px+env(safe-area-inset-bottom))] pt-10 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) auth.closeAuth();
      }}
    >
      <div className="anim-sheet max-h-full w-full max-w-[432px] overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 id="auth-title" className="text-[19px] font-extrabold">
            {title}
          </h2>
          <button
            type="button"
            onClick={auth.closeAuth}
            aria-label="閉じる"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink-soft)]"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {!auth.configured ? (
          <div className="mt-3 space-y-3 text-[14px] leading-7">
            <p>ログイン機能はいま準備中です。</p>
            <p className="text-[var(--color-ink-soft)]">
              ログインしなくても、よりみっけの機能はすべて使えます。
            </p>
            <button
              type="button"
              onClick={auth.closeAuth}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--color-terracotta)] text-[15px] font-bold text-white"
            >
              ログインせずに使う
            </button>
          </div>
        ) : sentTo ? (
          <div className="mt-3 space-y-3 text-[14px] leading-7">
            <p>
              <span className="font-bold">{sentTo}</span> に確認メールを送りました。
              メールのリンクを押すと登録が完了し、このアプリに戻ってきます。
            </p>
            <p className="text-[12px] text-[var(--color-ink-soft)]">
              届かないときは、迷惑メールのフォルダも確認してください。
            </p>
            <button
              type="button"
              onClick={auth.closeAuth}
              className="flex min-h-12 w-full items-center justify-center rounded-2xl bg-[var(--color-terracotta)] text-[15px] font-bold text-white"
            >
              閉じる
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-2">
            {/* ログインと新規登録の切り替え。どちらを選んだか迷わないよう、常に両方見せる。 */}
            <div role="tablist" aria-label="ログインの方法" className="grid grid-cols-2 gap-1 rounded-2xl bg-[var(--color-panel-soft)] p-1">
              {(["signIn", "signUp"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => auth.openAuth(m)}
                  className={`min-h-11 rounded-xl text-[14px] font-bold ${
                    mode === m
                      ? "bg-[var(--color-panel)] text-[var(--color-ink)] shadow"
                      : "text-[var(--color-ink-soft)]"
                  }`}
                >
                  {m === "signIn" ? "ログイン" : "新規登録"}
                </button>
              ))}
            </div>

            {signUp && (
              <label className="mt-4 block text-[13px] font-bold">
                表示名（任意）
                <input
                  ref={firstField}
                  type="text"
                  autoComplete="nickname"
                  maxLength={30}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例：たびびと"
                  className={field}
                />
              </label>
            )}

            <label className="mt-4 block text-[13px] font-bold">
              メールアドレス
              <input
                ref={signUp ? undefined : firstField}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="off"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={field}
              />
            </label>

            <label className="mt-4 block text-[13px] font-bold">
              パスワード{signUp && <span className="font-normal text-[var(--color-ink-soft)]">（8文字以上）</span>}
              <span className="relative mt-1.5 block">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={signUp ? "new-password" : "current-password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${field} mt-0 pr-20`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-1 my-auto flex h-10 items-center rounded-lg px-3 text-[12px] font-bold text-[var(--color-terracotta)]"
                >
                  {showPassword ? "隠す" : "表示"}
                </button>
              </span>
            </label>

            {error && (
              <p role="alert" className="mt-3 rounded-xl bg-[var(--color-sunset-soft)] px-3 py-2 text-[13px] leading-6 text-[var(--color-sunset-ink)]">
                {error}
              </p>
            )}

            <button
              type="submit"
              aria-disabled={busy}
              className="mt-5 flex min-h-13 w-full items-center justify-center rounded-2xl bg-[var(--color-terracotta)] py-3.5 text-[16px] font-bold text-white aria-disabled:opacity-60"
            >
              {busy ? "確認しています…" : signUp ? "登録する" : "ログインする"}
            </button>

            <button
              type="button"
              onClick={auth.closeAuth}
              className="mt-2 flex min-h-11 w-full items-center justify-center text-[13px] font-bold text-[var(--color-ink-soft)]"
            >
              ログインせずに使う
            </button>

            <p className="mt-2 text-[11px] leading-5 text-[var(--color-ink-soft)]">
              ログインしなくても、すべての機能を使えます。ログインすると、今後追加する
              記録の引き継ぎなどが使えるようになります。
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
