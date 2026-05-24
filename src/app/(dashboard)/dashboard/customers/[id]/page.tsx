import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCustomer } from "@/dal/customers";
import { resolveScope } from "@/lib/auth";
import { CheckInButton, GrantStampButton } from "./actions";
import { StampHistory } from "./stamp-history";

// 011: 組織単位で閲覧できるよう shop_id フィルタを外す
async function getVisitHistory(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visit_logs")
    .select("*")
    .eq("customer_id", customerId)
    .order("visited_at", { ascending: false })
    .limit(20);
  return data ?? [];
}

async function getIssuedCoupons(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("coupons_issued")
    .select("*, coupon_templates(title)")
    .eq("customer_id", customerId)
    .order("issued_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

async function getStampProgress(customerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_stamps")
    .select("*, stamp_cards(name, total_stamps)")
    .eq("customer_id", customerId);
  return data ?? [];
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const scope = await resolveScope(null);
  if (!scope) redirect("/login");

  const customer = await getCustomer(id, scope);
  if (!customer) notFound();

  const [visits, coupons, stamps] = await Promise.all([
    getVisitHistory(id),
    getIssuedCoupons(id),
    getStampProgress(id),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/customers"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; 顧客一覧
          </Link>
          <h1 className="text-2xl font-bold">
            {customer.display_name ?? "名前未設定"}
          </h1>
        </div>
        {/* UI03修正: ボタンを機能するクライアントコンポーネントに */}
        <div className="flex gap-2">
          <CheckInButton customerId={id} />
          {stamps.length > 0 && (
            <GrantStampButton
              customerId={id}
              stampCardId={stamps[0].stamp_card_id}
            />
          )}
        </div>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">プロフィール</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">LINE表示名</dt>
              <dd className="font-medium">{customer.display_name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">来店回数</dt>
              <dd className="font-medium">{customer.visit_count}回</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">初回来店</dt>
              <dd className="font-medium">
                {new Date(customer.first_visit_at).toLocaleDateString("ja-JP")}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">最終来店</dt>
              <dd className="font-medium">
                {customer.last_visit_at
                  ? new Date(customer.last_visit_at).toLocaleDateString("ja-JP")
                  : "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">タグ</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {customer.tags?.length > 0 ? (
                  customer.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground">タグなし</span>
                )}
              </dd>
            </div>
            {customer.memo && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">メモ</dt>
                <dd className="font-medium whitespace-pre-wrap">{customer.memo}</dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Stamp Progress */}
      {stamps.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">スタンプカード</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stamps.map((stamp) => {
              const card = stamp.stamp_cards as { name: string; total_stamps: number } | null;
              const total = card?.total_stamps ?? 10;
              const pct = Math.min(100, Math.round((stamp.current_stamps / total) * 100));
              return (
                <div key={stamp.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{card?.name ?? "スタンプカード"}</span>
                    <span className="text-muted-foreground">
                      {stamp.current_stamps}/{total}（完了 {stamp.completed_count}回）
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Stamp History (017: 店舗別履歴) */}
      <StampHistory customerId={id} />

      {/* Visit History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">来店履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {visits.length === 0 ? (
            <p className="text-sm text-muted-foreground">来店履歴がありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>来店日時</TableHead>
                  <TableHead>メモ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visits.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell>
                      {new Date(visit.visited_at).toLocaleString("ja-JP")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {visit.memo ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Issued Coupons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">発行済みクーポン</CardTitle>
        </CardHeader>
        <CardContent>
          {coupons.length === 0 ? (
            <p className="text-sm text-muted-foreground">クーポン履歴がありません</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>クーポン名</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>発行日</TableHead>
                  <TableHead>有効期限</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => {
                  const template = coupon.coupon_templates as { title: string } | null;
                  return (
                    <TableRow key={coupon.id}>
                      <TableCell className="font-medium">
                        {template?.title ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            coupon.status === "used"
                              ? "default"
                              : coupon.status === "expired"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {coupon.status === "active"
                            ? "未使用"
                            : coupon.status === "used"
                              ? "使用済み"
                              : "期限切れ"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(coupon.issued_at).toLocaleDateString("ja-JP")}
                      </TableCell>
                      <TableCell>
                        {new Date(coupon.expires_at).toLocaleDateString("ja-JP")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
