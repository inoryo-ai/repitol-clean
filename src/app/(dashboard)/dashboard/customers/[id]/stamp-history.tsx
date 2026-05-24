"use client";

import { useCallback, useEffect, useState } from "react";
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

interface StampHistoryEvent {
  id: string;
  stamped_at: string;
  shop_id: string | null;
  shop_code: string | null;
  shop_name: string | null;
  cycle: number;
}

interface StampHistoryResponse {
  events: StampHistoryEvent[];
  total: number;
}

const PAGE_SIZE = 20;

export function StampHistory({ customerId }: { customerId: string }) {
  const [events, setEvents] = useState<StampHistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/customers/${customerId}/stamp-history?limit=${PAGE_SIZE}&offset=${offset}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "履歴を取得できませんでした");
        return;
      }
      const data: StampHistoryResponse = await res.json();
      setTotal(data.total);
      setEvents((prev) => (append ? [...prev, ...data.events] : data.events));
    } catch {
      setError("通信エラー");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    load(0, false);
  }, [load]);

  function shopBadge(e: StampHistoryEvent) {
    if (e.shop_code === "shop_a") {
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">shop_a</Badge>;
    }
    if (e.shop_code === "shop_b") {
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">shop_b</Badge>;
    }
    if (e.shop_name) {
      return <Badge variant="secondary">{e.shop_name}</Badge>;
    }
    return <Badge variant="outline">不明</Badge>;
  }

  const canLoadMore = events.length < total;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">スタンプ履歴</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-3 text-sm text-destructive">{error}</p>
        )}
        {events.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">スタンプ履歴がありません</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>店舗</TableHead>
                  <TableHead className="text-right">周回</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      {new Date(e.stamped_at).toLocaleString("ja-JP")}
                    </TableCell>
                    <TableCell>{shopBadge(e)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {e.cycle + 1}周目
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {events.length} / {total} 件
              </span>
              {canLoadMore && (
                <button
                  type="button"
                  onClick={() => load(events.length, true)}
                  disabled={loading}
                  className="rounded-md border px-3 py-1 text-sm font-medium hover:bg-muted disabled:opacity-50"
                >
                  {loading ? "読み込み中…" : "もっと見る"}
                </button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
