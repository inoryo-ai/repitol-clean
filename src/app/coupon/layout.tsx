import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "マイクーポン",
  description: "ご利用可能なクーポン一覧",
};

export default function CouponLayout({ children }: { children: React.ReactNode }) {
  return children;
}
