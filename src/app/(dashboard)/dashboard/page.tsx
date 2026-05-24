import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCustomers, getCustomerCount } from "@/dal/customers";
import { getVisitCountThisMonth } from "@/dal/visits";
import { resolveScope, type DashboardScope } from "@/lib/auth";
import { ShopFilter } from "@/components/dashboard/shop-filter";

async function getCouponUsageRate(scope: DashboardScope): Promise<{ used: number; total: number }> {
  const supabase = await createClient();
  const build = () => {
    let q = supabase.from("coupons_issued").select("*", { count: "exact", head: true });
    q = scope.shopId ? q.eq("shop_id", scope.shopId) : q.eq("organization_id", scope.organizationId);
    return q;
  };
  const { count: total } = await build();
  const { count: used } = await build().eq("status", "used");
  return { used: used ?? 0, total: total ?? 0 };
}

async function getActiveStampCount(scope: DashboardScope): Promise<number> {
  const supabase = await createClient();
  // スタンプカード（組織共通）経由で customer_stamps をカウント
  const { data: cards } = await supabase
    .from("stamp_cards")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("is_active", true);
  if (!cards || cards.length === 0) return 0;

  let q = supabase
    .from("customer_stamps")
    .select("*", { count: "exact", head: true })
    .in("stamp_card_id", cards.map(c => c.id));
  if (scope.shopId) q = q.eq("shop_id", scope.shopId);

  const { count } = await q;
  return count ?? 0;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>;
}) {
  const sp = await searchParams;
  const scope = await resolveScope(sp.shop);
  if (!scope) redirect("/login");

  const [customerCount, visitCount, couponStats, stampCount, recentCustomers] =
    await Promise.all([
      getCustomerCount(scope),
      getVisitCountThisMonth(scope),
      getCouponUsageRate(scope),
      getActiveStampCount(scope),
      getCustomers(scope, 5),
    ]);

  const couponRate = couponStats.total > 0
    ? Math.round((couponStats.used / couponStats.total) * 100)
    : 0;

  const stats = [
    { label: "友だち数", value: customerCount.toLocaleString() },
    { label: "今月の来店数", value: visitCount.toLocaleString() },
    { label: "クーポン使用率", value: `${couponRate}%` },
    { label: "スタンプ利用者", value: stampCount.toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <ShopFilter shops={scope.shops} currentShopId={scope.shopId} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">最近の顧客</CardTitle>
        </CardHeader>
        <CardContent>
          {recentCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              まだ顧客データがありません。LINE友だち追加で自動登録されます。
            </p>
          ) : (
            <ul className="divide-y">
              {recentCustomers.map((customer) => (
                <li key={customer.id} className="flex items-center justify-between py-3">
                  <Link
                    href={`/dashboard/customers/${customer.id}`}
                    className="flex flex-1 items-center gap-3 hover:opacity-80"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                      {customer.display_name?.charAt(0) ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {customer.display_name ?? "名前未設定"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        来店 {customer.visit_count}回
                        {customer.last_visit_at &&
                          ` / 最終: ${new Date(customer.last_visit_at).toLocaleDateString("ja-JP")}`}
                      </p>
                    </div>
                  </Link>
                  <div className="flex gap-1">
                    {customer.tags?.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
