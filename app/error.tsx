"use client";

/**
 * Last line of defence for the page itself. Without it a render error shows
 * Next.js's blank error screen, which tells a visitor nothing.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="text-lg font-extrabold text-[var(--color-ink)]">
        よりみっけ を読み込めませんでした
      </p>
      <p className="max-w-xs text-sm leading-relaxed text-[var(--color-ink-soft)]">
        通信が不安定なときに起こることがあります。もう一度お試しください。
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-[var(--color-terracotta)] px-6 py-2.5 text-sm font-semibold text-white"
      >
        もう一度読み込む
      </button>
    </main>
  );
}
