import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "マイクーポン - Demo Restaurant",
  description: "Demo Restaurantのクーポンを確認・使用できます",
};

export default function CouponLayout({ children }: { children: React.ReactNode }) {
  return children;
}
