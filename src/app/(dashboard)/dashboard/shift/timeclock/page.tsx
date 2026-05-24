"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const STORE_CODES = ["shop_a", "shop_b", "shop_c"] as const;
type StoreCode = (typeof STORE_CODES)[number];
const STORE_LABEL: Record<StoreCode, string> = { shop_a: "shop_a", shop_b: "shop_b", shop_c: "Shop C" };

interface Employee {
  id: string;
  name: string;
  category: string;
  employment_type: string;
  hourly_wage: number;
}

interface TimeEntry {
  id: string;
  employee_id: string;
  store_code: StoreCode;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  notes: string;
}

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function durationMin(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let total = (eh * 60 + em) - (sh * 60 + sm);
  if (total < 0) total += 24 * 60;
  return Math.max(0, total - breakMin);
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function monthDates(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

export default function TimeclockPage() {
  const [yearMonth, setYearMonth] = useState<string>(thisMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dates = useMemo(() => monthDates(yearMonth), [yearMonth]);
  const monthFrom = dates[0];
  const monthTo = dates[dates.length - 1];

  const loadEmployees = useCallback(async () => {
    const r = await fetch("/api/shift/employees");
    const d = await r.json();
    if (r.ok) setEmployees(d.employees ?? []);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/shift/time-entries?from=${monthFrom}&to=${monthTo}`);
      const d = await r.json();
      if (r.ok) setEntries(d.entries ?? []);
    } finally { setLoading(false); }
  }, [monthFrom, monthTo]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  // 月次合計 by employee
  const totalByEmp = useMemo(() => {
    const t: Record<string, number> = {};
    for (const e of entries) {
      t[e.employee_id] = (t[e.employee_id] ?? 0) + durationMin(e.start_time.slice(0, 5), e.end_time.slice(0, 5), e.break_minutes);
    }
    return t;
  }, [entries]);

  // 実績(per emp×date)
  const entryByEmpDate = useMemo(() => {
    const m: Record<string, TimeEntry[]> = {};
    for (const e of entries) {
      const k = `${e.employee_id}|${e.date}`;
      m[k] = m[k] ?? [];
      m[k].push(e);
    }
    return m;
  }, [entries]);

  async function addEntry(employee_id: string, date: string) {
    setError("");
    const r = await fetch("/api/shift/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id, date,
        store_code: "shop_a",
        start_time: "11:00", end_time: "15:00",
        break_minutes: 0,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? "追加失敗");
      return;
    }
    await loadEntries();
  }

  async function patchEntry(id: string, patch: Partial<TimeEntry>) {
    await fetch(`/api/shift/time-entries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/shift/time-entries/${id}`, { method: "DELETE" });
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function copyFromPlanForEmp(empId: string) {
    if (!confirm("シフト計画(公開済 or 下書き)からこの月の配置を実績にコピーします。既存の実績はそのままです (重複可)。")) return;
    setLoading(true); setError("");
    try {
      // この実装は単純: 計画の assignments を 1 つずつ time_entries に POST
      // (本格運用なら専用エンドポイントを作ってバルク insert)
      let added = 0;
      for (const code of STORE_CODES) {
        // 各週で plan を取得
        for (let i = 0; i < dates.length; i += 7) {
          const week = dates[i];
          const dt = new Date(week);
          const day = dt.getDay();
          // 月曜だけスキャン(週ごと)
          if (day !== 1) continue;
          const r = await fetch(`/api/shift/plan?store=${code}&week=${week}`);
          const d = await r.json();
          if (!r.ok || !d.plan) continue;
          for (const a of d.plan.shift_assignments ?? []) {
            if (a.employee_id !== empId) continue;
            if (!dates.includes(a.date)) continue;
            await fetch("/api/shift/time-entries", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                employee_id: empId, store_code: code, date: a.date,
                start_time: a.start_time.slice(0, 5),
                end_time: a.end_time.slice(0, 5),
                break_minutes: a.break_minutes,
              }),
            });
            added += 1;
          }
        }
      }
      await loadEntries();
      setError("");
      if (added === 0) {
        setError("計画にこの従業員の配置はありませんでした");
      }
    } finally { setLoading(false); }
  }

  const selectedEmp = employees.find((e) => e.id === selectedEmpId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/shift" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; シフト
        </Link>
        <h1 className="text-2xl font-bold">勤怠 (実績入力)</h1>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="mb-1 block text-sm font-medium">対象月</label>
            <Input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="w-44" />
          </div>
          <Link href={`/dashboard/shift/payroll?ym=${yearMonth}`} className="text-sm text-primary hover:underline">
            この月の給与集計 →
          </Link>
        </CardContent>
      </Card>

      {/* 月次サマリ */}
      <Card>
        <CardHeader><CardTitle className="text-lg">月次実績サマリ ({yearMonth})</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b p-2 text-left">従業員</th>
                  <th className="border-b p-2 text-center">区分</th>
                  <th className="border-b p-2 text-right">時給</th>
                  <th className="border-b p-2 text-right">合計時間</th>
                  <th className="border-b p-2 text-right">概算給与</th>
                  <th className="border-b p-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const total = totalByEmp[emp.id] ?? 0;
                  const pay = Math.floor(total / 60 * emp.hourly_wage);
                  return (
                    <tr key={emp.id}>
                      <td className="border-b p-2 font-medium">{emp.name}</td>
                      <td className="border-b p-2 text-center text-xs">{emp.employment_type}</td>
                      <td className="border-b p-2 text-right">{emp.hourly_wage.toLocaleString()}円</td>
                      <td className="border-b p-2 text-right">{total > 0 ? fmtMin(total) : "-"}</td>
                      <td className="border-b p-2 text-right">{pay > 0 ? `${pay.toLocaleString()}円` : "-"}</td>
                      <td className="border-b p-2 text-right">
                        <button
                          onClick={() => setSelectedEmpId(emp.id)}
                          className={`rounded border px-2 py-1 text-xs ${selectedEmpId === emp.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                        >
                          詳細・入力
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 個別 詳細 */}
      {selectedEmp && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selectedEmp.name} の実績 ({yearMonth})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copyFromPlanForEmp(selectedEmp.id)}>
                計画から実績へ一括コピー
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="border-b p-1 text-left">日付</th>
                    <th className="border-b p-1">店舗</th>
                    <th className="border-b p-1">開始</th>
                    <th className="border-b p-1">終了</th>
                    <th className="border-b p-1">休憩(分)</th>
                    <th className="border-b p-1 text-right">実働</th>
                    <th className="border-b p-1 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d) => {
                    const ee = entryByEmpDate[`${selectedEmp.id}|${d}`] ?? [];
                    const dt = new Date(d);
                    const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
                    if (ee.length === 0) {
                      return (
                        <tr key={d} className={isWeekend ? "bg-rose-50/30" : ""}>
                          <td className="border-b p-1">{d.slice(5).replace("-", "/")}</td>
                          <td colSpan={5} className="border-b p-1 text-muted-foreground">-</td>
                          <td className="border-b p-1 text-right">
                            <button onClick={() => addEntry(selectedEmp.id, d)} className="rounded border px-1 py-0.5 hover:bg-muted">＋</button>
                          </td>
                        </tr>
                      );
                    }
                    return ee.map((e, idx) => (
                      <tr key={e.id} className={isWeekend ? "bg-rose-50/30" : ""}>
                        <td className="border-b p-1">{idx === 0 ? d.slice(5).replace("-", "/") : ""}</td>
                        <td className="border-b p-1">
                          <select
                            value={e.store_code}
                            onChange={(ev) => patchEntry(e.id, { store_code: ev.target.value as StoreCode })}
                            className="h-7 rounded border px-1 text-[10px]"
                          >
                            {STORE_CODES.map((s) => <option key={s} value={s}>{STORE_LABEL[s]}</option>)}
                          </select>
                        </td>
                        <td className="border-b p-1">
                          <Input type="time" value={e.start_time.slice(0, 5)} onChange={(ev) => patchEntry(e.id, { start_time: ev.target.value })} className="h-7 text-[10px]" />
                        </td>
                        <td className="border-b p-1">
                          <Input type="time" value={e.end_time.slice(0, 5)} onChange={(ev) => patchEntry(e.id, { end_time: ev.target.value })} className="h-7 text-[10px]" />
                        </td>
                        <td className="border-b p-1">
                          <Input type="number" min={0} step={15} value={e.break_minutes} onChange={(ev) => patchEntry(e.id, { break_minutes: Number(ev.target.value) })} className="h-7 w-16 text-[10px]" />
                        </td>
                        <td className="border-b p-1 text-right font-medium">
                          {fmtMin(durationMin(e.start_time.slice(0, 5), e.end_time.slice(0, 5), e.break_minutes))}
                        </td>
                        <td className="border-b p-1 text-right">
                          <button onClick={() => addEntry(selectedEmp.id, d)} className="rounded border px-1 py-0.5 hover:bg-muted">＋</button>
                          <button onClick={() => deleteEntry(e.id)} className="ml-1 rounded border px-1 py-0.5 text-rose-600 hover:bg-rose-50">×</button>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
            <div className="rounded bg-muted/30 p-2 text-sm">
              月合計: <strong>{fmtMin(totalByEmp[selectedEmp.id] ?? 0)}</strong>
              {" / "}概算給与: <strong>{((totalByEmp[selectedEmp.id] ?? 0) / 60 * selectedEmp.hourly_wage).toLocaleString()}円</strong>
              <Badge variant="outline" className="ml-2">{selectedEmp.employment_type}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
