"use client";

import { LANGS, useI18n } from "@/lib/i18n";

/**
 * 表示言語の切り替え。
 *
 * はじめての画面と設定画面の両方に置く。旅先で開いた人が最初にすることなので、
 * 文字だけの一覧ではなく、押しやすい大きさのボタンを並べる。
 * それぞれの言語名は、その言語の表記で出す（読めない言語で書いても選べない）。
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useI18n();

  return (
    <div>
      {!compact && (
        <p className="text-[13px] font-bold">
          {t("表示する言語")}
          {lang !== "en" && (
            <span className="ml-1 font-normal text-[var(--color-ink-soft)]">Language</span>
          )}
        </p>
      )}
      <div
        role="radiogroup"
        aria-label={t("表示する言語")}
        className={`flex flex-wrap gap-2 ${compact ? "" : "mt-2"}`}
      >
        {LANGS.map((l) => {
          const on = lang === l.code;
          return (
            <button
              key={l.code}
              type="button"
              role="radio"
              aria-checked={on}
              lang={l.code}
              onClick={() => setLang(l.code)}
              className={`flex min-h-12 items-center rounded-full border px-4 text-[14px] font-bold transition ${
                on
                  ? "border-[var(--color-terracotta)] bg-[var(--color-terracotta)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-ink)]"
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
