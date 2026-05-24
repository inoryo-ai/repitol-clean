import { redirect } from "next/navigation";
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
import { getCustomers } from "@/dal/customers";
import { resolveScope } from "@/lib/auth";
import { ShopFilter } from "@/components/dashboard/shop-filter";
import { CustomerSearch } from "@/components/dashboard/customer-search";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const scope = await resolveScope(sp.shop);
  if (!scope) redirect("/login");

  const all = await getCustomers(scope, 500);
  const q = (sp.q ?? "").trim().toLowerCase();
  const customers = q
    ? all.filter(c =>
        (c.display_name ?? "").toLowerCase().includes(q) ||
        c.tags?.some(t => t.toLowerCase().includes(q)) ||
        (c.memo ?? "").toLowerCase().includes(q)
      )
    : all;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">顧客管理</h1>
        <ShopFilter shops={scope.shops} currentShopId={scope.shopId} />
      </div>

      <CustomerSearch initialQuery={q} />

      {q && (
        <p className="text-sm text-muted-foreground">
          検索キーワード: <strong>{q}</strong>（{customers.length} / {all.length} 件）
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            顧客一覧（{customers.length}件）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              まだ顧客データがありません。LINE友だち追加で自動登録されます。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名前</TableHead>
                    <TableHead className="text-center">来店回数</TableHead>
                    <TableHead>最終来店</TableHead>
                    <TableHead>タグ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell>
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {customer.display_name ?? "名前未設定"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        {customer.visit_count}
                      </TableCell>
                      <TableCell>
                        {customer.last_visit_at
                          ? new Date(customer.last_visit_at).toLocaleDateString("ja-JP")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {customer.tags?.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
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
