"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const STORE_CODES = ["shop_a", "shop_b", "shop_c"] as const;
type StoreCode = (typeof STORE_CODES)[number];
const STORE_LABEL: Record<StoreCode, string> = { shop_a: "shop_a", shop_b: "shop_b", shop_c: "Shop C" };
const DOW_LABEL = ["日", "月", "火", "水", "木", "金", "土"] as const;

interface StaffingRow {
  id: string;
  store_code: StoreCode;
  day_of_week: number;
  start_time: string;
  end_time: string;
  required_count: number;
  role: string | null;
  notes: string;
  is_active: boolean;
}

export default function StaffingPage() {
  const [rows, setRows] = useState<StaffingRow[]>([]);
  const [storeTab, setStoreTab] = useState<StoreCode>("shop_a");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shift/staffing");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "load failed");
      setRows(d.staffing ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setError("");
    const res = await fetch("/api/shift/staffing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        store_code: storeTab,
        day_of_week: 1, // 月
        start_time: "11:00",
        end_time: "15:00",
        required_count: 2,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "追加失敗");
      return;
    }
    await load();
  }

  async function bulkInitDays() {
    setError("");
    const res = await fetch("/api/shift/staffing/bulk-init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ store_code: storeTab }),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error ?? "一括初期化失敗");
      return;
    }
    await load();
  }

  async function patchRow(id: string, patch: Partial<StaffingRow>) {
    const res = await fetch(`/api/shift/staffing/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "保存失敗");
      return;
    }
    setRows((p) => p.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  async function removeRow(id: string) {
    if (!confirm("削除しますか？")) return;
    const res = await fetch(`/api/shift/staffing/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("削除失敗");
      return;
    }
    setRows((p) => p.filter((r) => r.id !== id));
  }

  const filtered = rows.filter((r) => r.store_code === storeTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/shift" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; シフト
        </Link>
        <h1 className="text-2xl font-bold">必要人員設定</h1>
      </div>

      {/* タブ */}
      <div className="flex flex-wrap gap-2 border-b">
        {STORE_CODES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStoreTab(s)}
            className={`rounded-t-md border-b-2 px-4 py-2 text-sm font-medium ${
              storeTab === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {STORE_LABEL[s]}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{STORE_LABEL[storeTab]} の必要人員 ({filtered.length}件)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            曜日×時間帯ごとに、必要な最低人員を設定。シフト自動配置時の制約として使用されます。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={add} disabled={loading}>＋ 行を追加</Button>
            <Button onClick={bulkInitDays} disabled={loading} variant="outline">
              7曜日分の初期行を作成
            </Button>
            {(() => {
              const haveDows = new Set(filtered.map((r) => r.day_of_week));
              const missing = DOW_LABEL.map((d, i) => ({ d, i }))
                .filter((x) => !haveDows.has(x.i));
              if (missing.length === 0) return (
                <Badge variant="secondary">全曜日 設定済</Badge>
              );
              return (
                <Badge variant="outline">
                  未設定: {missing.map((m) => m.d).join("/")}
                </Badge>
              );
            })()}
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>曜日</TableHead>
                  <TableHead>開始</TableHead>
                  <TableHead>終了</TableHead>
                  <TableHead className="text-center">必要人員</TableHead>
                  <TableHead>役割</TableHead>
                  <TableHead>備考</TableHead>
                  <TableHead className="text-center">有効</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">未設定</TableCell></TableRow>
                ) : filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <select
                        value={r.day_of_week}
                        onChange={(e) => patchRow(r.id, { day_of_week: Number(e.target.value) })}
                        className="h-9 rounded-md border px-2 text-sm"
                      >
                        {DOW_LABEL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input type="time" value={r.start_time.slice(0, 5)} onChange={(e) => patchRow(r.id, { start_time: e.target.value })} className="w-28" />
                    </TableCell>
                    <TableCell>
                      <Input type="time" value={r.end_time.slice(0, 5)} onChange={(e) => patchRow(r.id, { end_time: e.target.value })} className="w-28" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input type="number" min={1} value={r.required_count} onChange={(e) => patchRow(r.id, { required_count: Number(e.target.value) })} className="w-16 mx-auto text-center" />
                    </TableCell>
                    <TableCell>
                      <Input value={r.role ?? ""} onChange={(e) => patchRow(r.id, { role: e.target.value || null })} placeholder="任意" className="w-28" />
                    </TableCell>
                    <TableCell>
                      <Input value={r.notes} onChange={(e) => patchRow(r.id, { notes: e.target.value })} placeholder="備考" />
                    </TableCell>
                    <TableCell className="text-center">
                      <input type="checkbox" checked={r.is_active} onChange={(e) => patchRow(r.id, { is_active: e.target.checked })} className="h-4 w-4" />
                    </TableCell>
                    <TableCell className="text-right">
                      <button onClick={() => removeRow(r.id)} className="rounded border px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
                        削除
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium">運用ヒント</p>
        <p className="mt-1">同じ曜日に複数行を作って細かい時間帯設定が可能 (例: 月曜 11:00-15:00 = 2名 / 18:00-23:00 = 3名)。</p>
        <p>ピーク時間帯は <Badge variant="outline" className="mx-1">必要人員=多</Badge> 落ち着く時間帯は <Badge variant="outline" className="mx-1">必要人員=1〜2</Badge> が目安。</p>
      </div>
    </div>
  );
}
