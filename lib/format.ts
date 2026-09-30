import { translateStatic } from "@/lib/i18n";

/**
 * Removes Markdown decoration from model output.
 *
 * The app renders answers as plain text and reads them aloud, so "**ルート名:**"
 * showed literal asterisks on screen and was spoken as "アスタリスク".
 */
/** Removes bare URLs; they are unreadable when spoken. */
export function stripUrls(text: string): string {
  return text
    // Stop at Japanese punctuation: a full-width bracket right after the URL
    // is part of the sentence, not part of the link.
    .replace(/https?:\/\/[^\s、。，．）」』】〉》＞>]+/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/（\s*）|\(\s*\)/g, "")
    .trim();
}

export function stripMarkdown(text: string): string {
  return text
    // **bold** / __bold__ → bold
    .replace(/\*\*(.+?)\*\*/gs, "$1")
    .replace(/__(.+?)__/gs, "$1")
    // *italic* / _italic_ → italic (leave bare * used as a bullet alone)
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1$2")
    .replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, "$1$2")
    // `code` → code
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    // Bullet markers at the start of a line → "・"
    .replace(/^[ \t]*[*+-][ \t]+/gm, "・")
    // Headings and blockquotes
    .replace(/^[ \t]*#{1,6}[ \t]*/gm, "")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    // Horizontal rules
    .replace(/^[ \t]*([-*_])(?:[ \t]*\1){2,}[ \t]*$/gm, "")
    // [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Collapse the blank lines left behind
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 「1時間30分」のような所要時間の書き方。
 *
 * 画面の言語に合わせて訳す（英語なら "1 h 30 min"）。フックの外からも呼ぶので
 * translateStatic を使う。数字だけを差し込み、並びは辞書側で決められる。
 */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return translateStatic("{h}時間{m}分").replace("{h}", String(h)).replace("{m}", String(m));
  if (h) return translateStatic("{h}時間").replace("{h}", String(h));
  return translateStatic("{m}分").replace("{m}", String(m));
}
