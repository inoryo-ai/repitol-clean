import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "認証中...",
};

export default function DispatcherLayout({ children }: { children: React.ReactNode }) {
  return children;
}
