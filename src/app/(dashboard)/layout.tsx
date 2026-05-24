import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Separator } from "@/components/ui/separator";
import { LogoutButton } from "@/components/dashboard/logout-button";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード" },
  { href: "/dashboard/customers", label: "顧客管理" },
  { href: "/dashboard/coupons", label: "クーポン" },
  { href: "/dashboard/stamps", label: "スタンプカード" },
  { href: "/dashboard/menu", label: "メニュー" },
  { href: "/dashboard/broadcast", label: "一斉配信" },
  { href: "/dashboard/auto-triggers", label: "自動トリガー" },
  { href: "/dashboard/shift", label: "シフト自動作成" },
  { href: "/dashboard/settings", label: "設定" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border/40 bg-muted/20 md:block">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-2 px-6">
            <span className="text-xl">🔁</span>
            <span className="text-lg font-bold">リピトル</span>
          </div>

          <Separator />

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4">
            <ul className="space-y-1">
              {navItems.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Separator />

          {/* User section */}
          <div className="px-4 py-4">
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {user.email}
            </p>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border/40 px-4 md:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔁</span>
            <span className="text-lg font-bold">リピトル</span>
          </div>
{/* UI10修正: モバイルでドロップダウンメニュー代わりに2行表示 */}
          <nav className="flex flex-wrap items-center justify-end gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        </header>

        {/* Main content */}
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
