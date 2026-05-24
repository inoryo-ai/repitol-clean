import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタンプカード",
  description: "来店スタンプを集めて特典を受け取ろう",
};

export default function StampLayout({ children }: { children: React.ReactNode }) {
  return children;
}
