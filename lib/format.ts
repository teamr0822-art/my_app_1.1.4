/**
 * Removes Markdown decoration from model output.
 *
 * The app renders answers as plain text and reads them aloud, so "**ルート名:**"
 * showed literal asterisks on screen and was spoken as "アスタリスク".
 */
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
