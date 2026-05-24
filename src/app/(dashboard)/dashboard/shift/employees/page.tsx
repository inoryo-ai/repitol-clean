"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type StoreCode = "shop_a" | "shop_b" | "shop_c";
const STORE_LABEL: Record<StoreCode, string> = {
  shop_a: "shop_a",
  shop_b: "shop_b",
  shop_c: "Shop C",
};

interface EmployeeStoreRow {
  id: string;
  store_code: StoreCode;
  total_days: number;
  n_haya: number;
  n_naka: number;
  n_henso: number;
  default_enabled: boolean;
  default_weekly_days: number;
  preferred_time_band: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  kana: string | null;
  category: "社員" | "混合" | "アルバイト";
  employment_type: "社員" | "アルバイト" | "パート";
  hourly_wage: number;
  monthly_salary: number | null;
  is_active: boolean;
  notes: string;
  shift_employee_stores: EmployeeStoreRow[];
}

const CATEGORY_BADGE: Record<EmployeeRow["category"], string> = {
  社員: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  混合: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  アルバイト: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};

export default function ShiftEmployeesPage() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [creating, setCreating] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/shift/employees");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "load failed");
      setEmployees(d.employees ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleImport(file: File) {
    setError(""); setInfo(""); setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/shift/employees/import", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "import failed");
      setInfo(`一括登録完了: ${d.n_employees} 名 / ${d.n_store_rows} 件の店舗データ`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function saveEmployee(emp: Partial<EmployeeRow> & { id?: string }) {
    setError("");
    const isNew = !emp.id;
    const url = isNew ? "/api/shift/employees" : `/api/shift/employees/${emp.id}`;
    const res = await fetch(url, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: emp.name,
        kana: emp.kana,
        category: emp.category,
        employment_type: emp.employment_type,
        hourly_wage: emp.hourly_wage,
        monthly_salary: emp.monthly_salary,
        notes: emp.notes,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "save failed");
      return;
    }
    setEditing(null);
    setCreating(false);
    setInfo(isNew ? "登録しました" : "更新しました");
    await load();
  }

  async function softDelete(id: string) {
    if (!confirm("この従業員を無効化しますか？")) return;
    const res = await fetch(`/api/shift/employees/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("削除失敗");
      return;
    }
    await load();
  }

  const filtered = employees.filter((e) => !search || e.name.includes(search) || (e.kana ?? "").includes(search));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/shift" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; シフト作成
          </Link>
          <h1 className="text-2xl font-bold">従業員管理</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()} disabled={loading}>
            JSON 一括取込
          </Button>
          <Button onClick={() => { setCreating(true); setEditing({ id: "", name: "", kana: "", category: "アルバイト", employment_type: "アルバイト", hourly_wage: 1200, monthly_salary: null, is_active: true, notes: "", shift_employee_stores: [] }); }}>
            新規追加
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">登録従業員 ({employees.length}名)</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="名前/かなで検索"
              className="w-48"
            />
          </div>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              登録された従業員はまだありません。「JSON 一括取込」または「新規追加」から始めてください。
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名前</TableHead>
                    <TableHead className="text-center">区分</TableHead>
                    {(["shop_a", "shop_b", "shop_c"] as StoreCode[]).map((s) => (
                      <TableHead key={s} className="text-center">{STORE_LABEL[s]}</TableHead>
                    ))}
                    <TableHead>備考</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {e.name}
                        {e.kana && <span className="ml-2 text-xs text-muted-foreground">{e.kana}</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={CATEGORY_BADGE[e.category]}>{e.category}</Badge>
                      </TableCell>
                      {(["shop_a", "shop_b", "shop_c"] as StoreCode[]).map((s) => {
                        const row = e.shift_employee_stores.find((r) => r.store_code === s);
                        return (
                          <TableCell key={s} className="text-center text-xs">
                            {row && row.total_days > 0 ? (
                              <div>
                                <div>{row.total_days}日</div>
                                <div className="text-muted-foreground">早{row.n_haya}/中{row.n_naka}/変{row.n_henso}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                        {e.notes}
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-muted"
                          onClick={() => { setEditing(e); setCreating(false); }}
                        >
                          編集
                        </button>
                        <button
                          className="ml-1 rounded border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => softDelete(e.id)}
                        >
                          無効化
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 編集モーダル風 */}
      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{creating ? "新規登録" : "編集"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <form
              onSubmit={(e) => { e.preventDefault(); saveEmployee(editing); }}
              className="space-y-3"
            >
              <div>
                <label className="mb-1 block text-sm font-medium">名前 *</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">ふりがな (任意)</label>
                <Input
                  value={editing.kana ?? ""}
                  onChange={(e) => setEditing({ ...editing, kana: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">区分 (履歴ベース)</label>
                <select
                  value={editing.category}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value as EmployeeRow["category"] })}
                  className="h-9 rounded-md border px-2 text-sm"
                >
                  <option value="社員">社員</option>
                  <option value="混合">混合</option>
                  <option value="アルバイト">アルバイト</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">雇用形態</label>
                <select
                  value={editing.employment_type}
                  onChange={(e) => setEditing({ ...editing, employment_type: e.target.value as EmployeeRow["employment_type"] })}
                  className="h-9 rounded-md border px-2 text-sm"
                >
                  <option value="社員">社員 (月給)</option>
                  <option value="アルバイト">アルバイト (時給)</option>
                  <option value="パート">パート (時給)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">時給 (円/時)</label>
                  <Input
                    type="number" min={0} step={50}
                    value={editing.hourly_wage ?? 0}
                    onChange={(e) => setEditing({ ...editing, hourly_wage: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">月給 (社員のみ・円)</label>
                  <Input
                    type="number" min={0} step={1000}
                    value={editing.monthly_salary ?? ""}
                    placeholder="任意"
                    onChange={(e) => setEditing({ ...editing, monthly_salary: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">備考</label>
                <textarea
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  className="min-h-[60px] w-full rounded-md border bg-background p-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{creating ? "登録する" : "保存する"}</Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(null); setCreating(false); }}>
                  キャンセル
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}
    </div>
  );
}
