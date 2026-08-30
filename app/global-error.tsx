"use client";

/** Catches errors thrown in the root layout itself. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ja">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 32,
          textAlign: "center",
          background: "#f3f1e3",
          color: "#2c3529",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ fontWeight: 800 }}>よりみっけ を読み込めませんでした</p>
        <button
          type="button"
          onClick={reset}
          style={{
            background: "#4a6f4d",
            color: "#fff",
            border: 0,
            borderRadius: 999,
            padding: "10px 24px",
            fontWeight: 600,
          }}
        >
          もう一度読み込む
        </button>
      </body>
    </html>
  );
}
