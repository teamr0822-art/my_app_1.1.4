"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import en from "@/data/i18n/en.json";
import fr from "@/data/i18n/fr.json";
import ko from "@/data/i18n/ko.json";
import zh from "@/data/i18n/zh.json";

/**
 * 表示言語。
 *
 * ■ しくみ（あとで直しやすいことを最優先にしている）
 * 画面のコードには日本語をそのまま書き、それを「鍵」として訳を引く。
 *   t("話しかけてみる") → 英語なら "Start a conversation"
 * 訳が無い語はそのまま日本語が出るので、訳し忘れても画面は壊れない。
 * 訳を足すときは data/i18n/<言語>.json に「日本語: 訳」を1行足すだけでよく、
 * コードには触らなくていい。
 *
 * 日本語は辞書を持たない（書いてある文がそのまま出る）。
 */

export const LANGS = [
  { code: "ja", label: "日本語", english: "Japanese" },
  { code: "en", label: "English", english: "English" },
  { code: "fr", label: "Français", english: "French" },
  { code: "ko", label: "한국어", english: "Korean" },
  { code: "zh", label: "中文", english: "Chinese" },
] as const;

export type Lang = (typeof LANGS)[number]["code"];

/** AI に「この言語で答えて」と伝えるための名前。 */
export const LANG_FOR_AI: Record<Lang, string> = {
  ja: "日本語",
  en: "英語（English）",
  fr: "フランス語（Français）",
  ko: "韓国語（한국어）",
  zh: "中国語（简体中文）",
};

const DICTIONARIES: Record<Lang, Record<string, string>> = {
  ja: {},
  en: en as Record<string, string>,
  fr: fr as Record<string, string>,
  ko: ko as Record<string, string>,
  zh: zh as Record<string, string>,
};

const STORAGE_KEY = "yorimikke-lang-v1";

/**
 * いま選ばれている言語の控え（フックを使えない場所から読むため）。
 *
 * localStorage を直接読まないのが肝心。サーバーで描いた HTML は必ず日本語なので、
 * ブラウザでの最初の描画も日本語でないと食い違い（hydration error）になる。
 * ここは Provider が画面を出したあとに設定し、そのとき全体が描き直される。
 */
let currentLang: Lang = "ja";

type I18nState = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** 日本語の文を鍵にして訳を引く。{name} のような差し込みにも対応する。 */
  t: (ja: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nState | null>(null);

/** 端末の言語設定から、いちばん近いものを選ぶ。 */
function detect(): Lang {
  if (typeof navigator === "undefined") return "ja";
  for (const raw of navigator.languages ?? [navigator.language]) {
    const code = (raw ?? "").toLowerCase();
    if (code.startsWith("ja")) return "ja";
    if (code.startsWith("en")) return "en";
    if (code.startsWith("fr")) return "fr";
    if (code.startsWith("ko")) return "ko";
    if (code.startsWith("zh")) return "zh";
  }
  return "ja";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // サーバーで描くときは日本語。端末の設定は、画面が出たあとに読む。
  const [lang, setLangState] = useState<Lang>("ja");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
      const next = saved && LANGS.some((l) => l.code === saved) ? saved : detect();
      currentLang = next;
      setLangState(next);
    } catch {
      const next = detect();
      currentLang = next;
      setLangState(next);
    }
  }, []);

  // 読み上げや検索エンジンのために、ページの言語も合わせる。
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    currentLang = next;
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* 保存できなくても、その場では切り替わる */
    }
  }, []);

  const t = useCallback<I18nState["t"]>(
    (ja, vars) => {
      const dict = DICTIONARIES[lang];
      let out = dict[ja] ?? ja;
      if (vars) {
        for (const [key, value] of Object.entries(vars)) {
          out = out.replaceAll(`{${key}}`, String(value));
        }
      }
      return out;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nState {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n は I18nProvider の内側で使ってください");
  return ctx;
}

/**
 * フックを使えない場所（class で書いた ErrorBoundary など）から訳を引くための
 * 逃げ道。保存してある言語を直接読む。画面の描き直しには連動しない。
 */
export function translateStatic(ja: string): string {
  return DICTIONARIES[currentLang][ja] ?? ja;
}

/** 文字だけ要るときの近道。 */
export function useT() {
  return useI18n().t;
}
