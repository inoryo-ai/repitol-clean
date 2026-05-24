import type { Metadata } from "next";
import { Noto_Sans_JP, Geist_Mono } from "next/font/google";
import "./globals.css";

// UI07修正: Noto Sans JPを使用（全社ルール準拠）
const notoSansJP = Noto_Sans_JP({ variable: "--font-noto-sans-jp", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "リピトル - 飲食店のリピーターを増やすLINE CRM",
  description: "LINE公式アカウントと連携して、顧客管理・クーポン配信・スタンプカード・予約リマインドを月額980円から。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // UI06修正: dark固定を削除（システム設定に従う）
    <html lang="ja" className={`${notoSansJP.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground font-[family-name:var(--font-noto-sans-jp)]">{children}</body>
    </html>
  );
}
