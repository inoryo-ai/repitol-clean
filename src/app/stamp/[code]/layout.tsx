import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタンプカード - Demo Restaurant",
  description: "Demo Restaurantのスタンプカードです",
};

export default function StampLayout({ children }: { children: React.ReactNode }) {
  return children;
}
