import notices from "@/data/notices.json";
import type { Lang } from "@/lib/i18n";

/**
 * 案内をはじめる前に出す注意書き。
 *
 * 方針:
 *   日本語 … その場所に特別な注意があるときだけ出す（一般的なマナーは書かない）
 *   その他 … 共通のマナー（data/notices.json の common）＋ その場所の特別な注意
 *
 * 文面は data/notices.json にまとまっていて、コードを触らずに直せる。
 */

type NoticeFile = {
  common: Partial<Record<Lang, string[]>>;
  spots: Record<string, Partial<Record<Lang, string>>>;
};

const data = notices as unknown as NoticeFile;

export type Notice = {
  /** その場所だけの注意（あれば先頭に出す）。 */
  spot: string | null;
  /** 共通のマナー。日本語では空。 */
  common: string[];
};

export function noticeFor(spotId: string, lang: Lang): Notice {
  const spot = data.spots?.[spotId]?.[lang] ?? null;
  const common = lang === "ja" ? [] : (data.common?.[lang] ?? data.common?.en ?? []);
  return { spot, common };
}

/** 出すものが何もないときは、画面に枠だけ出さない。 */
export function hasNotice(spotId: string, lang: Lang): boolean {
  const n = noticeFor(spotId, lang);
  return Boolean(n.spot) || n.common.length > 0;
}
