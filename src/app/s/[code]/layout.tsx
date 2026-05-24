import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタンプ付与",
  description: "店頭QRからのスタンプ付与",
};

export default function StampGrantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
