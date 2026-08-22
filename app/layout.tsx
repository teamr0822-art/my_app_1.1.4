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
  title: "話して発見 | 高知市の史跡AI音声ガイド",
  description:
    "高知市の文化財・史跡を、AIガイドとの音声のやりとりで楽しめる音声ガイドアプリ。話しかけると、出典に基づいて解説してくれます。",
  keywords: ["高知市", "文化財", "史跡", "音声ガイド", "AIガイド", "観光"],
  openGraph: {
    title: "話して発見 | 高知市の史跡AI音声ガイド",
    description:
      "高知市の文化財・史跡を、AIガイドとの音声のやりとりで楽しめる音声ガイドアプリ。",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#c96f4a",
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
