import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";
import { OfflineStatus } from "@/components/offline-status";

const notoSansJP = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "よりみっけ｜知らなかった街の魅力を、旅の途中で見つけよう。",
  description:
    "知らなかった街の魅力を、旅の途中で見つけよう。気になった場所に話しかけると、その土地の物語が返ってきます。歩く時間や気分に合わせて、寄り道の道順もご案内。",
  keywords: ["よりみっけ", "寄り道", "まち歩き", "史跡", "文化財", "観光", "音声ガイド"],
  // ホーム画面から起動できるようにする。旅先で「あのサイトどこだっけ」を防ぐ。
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "よりみっけ" },
  openGraph: {
    title: "よりみっけ",
    description: "知らなかった街の魅力を、旅の途中で見つけよう。",
    type: "website",
  },
};

/**
 * ピンチズームは禁止しない。
 *
 * 屋外では、細かい文字を拡大したい場面（地図の地名、出典、注意書き）が普通に
 * ある。拡大できないことで得られるのは「誤操作が少しだけ減る」程度で、
 * 拡大が必要な人にとっては使えないアプリになる。
 */
export const viewport: Viewport = {
  themeColor: "#3d6f8e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body>
        <OfflineStatus />
        {children}
      </body>
    </html>
  );
}
