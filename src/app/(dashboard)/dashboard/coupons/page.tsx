import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import type { CouponTemplate } from "@/lib/types/database";
import { resolveScope, type DashboardScope } from "@/lib/auth";
import { ShopFilter } from "@/components/dashboard/shop-filter";

async function getCouponTemplates(scope: DashboardScope, includeInactive: boolean): Promise<CouponTemplate[]> {
  const supabase = await createClient();
  let q = supabase.from("coupon_templates").select("*");
  q = scope.shopId ? q.eq("shop_id", scope.shopId) : q.eq("organization_id", scope.organizationId);
  if (!includeInactive) q = q.eq("is_active", true);
  const { data } = await q.order("created_at", { ascending: false });
  return (data as CouponTemplate[]) ?? [];
}

const typeLabels: Record<string, string> = {
  discount_percent: "割引（%）",
  discount_yen: "割引（円）",
  free_item: "無料提供",
  custom: "カスタム",
};

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; inactive?: string }>;
}) {
  const sp = await searchParams;
  const scope = await resolveScope(sp.shop);
  if (!scope) redirect("/login");

  const includeInactive = sp.inactive === "1";
  const templates = await getCouponTemplates(scope, includeInactive);

  const currentBase = new URLSearchParams();
  if (sp.shop) currentBase.set("shop", sp.shop);
  const toggleHref = (() => {
    const next = new URLSearchParams(currentBase);
    if (!includeInactive) next.set("inactive", "1");
    const s = next.toString();
    return s ? `?${s}` : "";
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">クーポン管理</h1>
        <div className="flex items-center gap-3">
          <ShopFilter shops={scope.shops} currentShopId={scope.shopId} />
          <Link href="/dashboard/coupons/new" className={buttonVariants()}>
            新規作成
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          href={toggleHref || "/dashboard/coupons"}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {includeInactive ? "有効のみ表示" : "無効も表示"}
        </Link>
        {includeInactive && (
          <span className="text-xs text-muted-foreground">
            ※ 無効化されたテンプレートも一覧に含めています
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            クーポンテンプレート（{templates.length}件）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {includeInactive
                ? "テンプレートがありません。「新規作成」から追加してください。"
                : "有効なテンプレートがありません。「無効も表示」で過去のものを確認できます。"}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">画像</TableHead>
                    <TableHead>タイトル</TableHead>
                    <TableHead>種別</TableHead>
                    <TableHead className="text-center">有効日数</TableHead>
                    <TableHead className="text-center">ステータス</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id} className={t.is_active ? "" : "opacity-60"}>
                      <TableCell>
                        {t.image_url ? (
                          <Image
                            src={t.image_url}
                            alt={t.title}
                            width={48}
                            height={48}
                            unoptimized
                            className="h-12 w-12 rounded-md border object-cover bg-muted"
                          />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-md border bg-muted text-[10px] text-muted-foreground">
                            なし
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link href={`/dashboard/coupons/${t.id}`} className="text-primary hover:underline">
                          {t.title}
                        </Link>
                        {t.description && (
                          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                            {t.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {typeLabels[t.coupon_type] ?? t.coupon_type}
                        {t.discount_value != null && (
                          <span className="ml-1 text-muted-foreground">
                            ({t.discount_value}
                            {t.coupon_type === "discount_percent" ? "%" : "円"})
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{t.valid_days}日</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={t.is_active ? "default" : "secondary"}>
                          {t.is_active ? "有効" : "無効"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/dashboard/coupons/${t.id}`}
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          詳細・編集
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
