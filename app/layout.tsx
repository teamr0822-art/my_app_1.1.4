import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

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
  openGraph: {
    title: "よりみっけ",
    description: "知らなかった街の魅力を、旅の途中で見つけよう。",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#4a6f4d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={notoSansJP.variable}>
      <body>{children}</body>
    </html>
  );
}
