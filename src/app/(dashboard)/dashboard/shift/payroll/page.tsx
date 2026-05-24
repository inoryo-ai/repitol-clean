"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Employee {
  id: string;
  name: string;
  category: string;
  employment_type: "社員" | "アルバイト" | "パート";
  hourly_wage: number;
  monthly_salary: number | null;
}
interface TimeEntry {
  id: string;
  employee_id: string;
  store_code: string;
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

function fmtH(min: number): string {
  return (min / 60).toFixed(1);
}

function monthRange(yearMonth: string): { from: string; to: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = `${y}-${String(m).padStart(2, "0")}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
  return { from: first, to: last };
}

export default function PayrollPage() {
  const sp = useSearchParams();
  const [yearMonth, setYearMonth] = useState<string>(sp.get("ym") ?? thisMonth());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const range = useMemo(() => monthRange(yearMonth), [yearMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/shift/employees").then((r) => r.json()),
        fetch(`/api/shift/time-entries?from=${range.from}&to=${range.to}`).then((r) => r.json()),
      ]);
      setEmployees(r1.employees ?? []);
      setEntries(r2.entries ?? []);
    } finally { setLoading(false); }
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  // 集計: emp -> { totalMin, byStore: { code: min } }
  const summary = useMemo(() => {
    const out: Record<string, { totalMin: number; byStore: Record<string, number>; n_days: Set<string> }> = {};
    for (const e of entries) {
      const m = durationMin(e.start_time.slice(0, 5), e.end_time.slice(0, 5), e.break_minutes);
      const s = out[e.employee_id] ?? { totalMin: 0, byStore: {}, n_days: new Set<string>() };
      s.totalMin += m;
      s.byStore[e.store_code] = (s.byStore[e.store_code] ?? 0) + m;
      s.n_days.add(e.date);
      out[e.employee_id] = s;
    }
    return out;
  }, [entries]);

  function downloadCsv() {
    const lines: string[] = [];
    lines.push("従業員,雇用形態,出勤日数,合計時間(h),時給,月給,基本給,備考");
    for (const emp of employees) {
      const s = summary[emp.id];
      const totalH = s ? s.totalMin / 60 : 0;
      const isMonthly = emp.employment_type === "社員" && emp.monthly_salary;
      const basePay = isMonthly
        ? emp.monthly_salary
        : Math.floor(totalH * emp.hourly_wage);
      lines.push([
        `"${emp.name}"`,
        emp.employment_type,
        s ? s.n_days.size : 0,
        totalH.toFixed(2),
        emp.hourly_wage,
        emp.monthly_salary ?? "",
        basePay,
        "",
      ].join(","));
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `payroll_${yearMonth}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const grandTotal = useMemo(() => {
    let pay = 0;
    let minutes = 0;
    for (const emp of employees) {
      const s = summary[emp.id];
      if (s) minutes += s.totalMin;
      const isMonthly = emp.employment_type === "社員" && emp.monthly_salary;
      if (isMonthly && emp.monthly_salary) pay += emp.monthly_salary;
      else pay += Math.floor((s?.totalMin ?? 0) / 60 * emp.hourly_wage);
    }
    return { pay, minutes };
  }, [employees, summary]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/shift" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; シフト
        </Link>
        <h1 className="text-2xl font-bold">給与集計</h1>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="mb-1 block text-sm font-medium">対象月</label>
            <Input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="w-44" />
          </div>
          <Button onClick={downloadCsv}>CSV ダウンロード</Button>
          <Link href={`/dashboard/shift/timeclock?ym=${yearMonth}`} className="text-sm text-primary hover:underline">
            実績を編集 →
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">月次給与 ({yearMonth})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">読込中...</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b p-2 text-left">従業員</th>
                  <th className="border-b p-2 text-center">雇用形態</th>
                  <th className="border-b p-2 text-right">出勤日数</th>
                  <th className="border-b p-2 text-right">合計時間</th>
                  <th className="border-b p-2 text-right">shop_a</th>
                  <th className="border-b p-2 text-right">shop_b</th>
                  <th className="border-b p-2 text-right">Shop C</th>
                  <th className="border-b p-2 text-right">時給/月給</th>
                  <th className="border-b p-2 text-right">基本給</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const s = summary[emp.id];
                  const totalH = s ? s.totalMin / 60 : 0;
                  const isMonthly = emp.employment_type === "社員" && emp.monthly_salary;
                  const pay = isMonthly
                    ? emp.monthly_salary
                    : Math.floor(totalH * emp.hourly_wage);
                  return (
                    <tr key={emp.id}>
                      <td className="border-b p-2 font-medium">{emp.name}</td>
                      <td className="border-b p-2 text-center text-xs">
                        <Badge variant="outline">{emp.employment_type}</Badge>
                      </td>
                      <td className="border-b p-2 text-right">{s?.n_days.size ?? 0}日</td>
                      <td className="border-b p-2 text-right">{totalH > 0 ? `${fmtH(s.totalMin)}h` : "-"}</td>
                      <td className="border-b p-2 text-right text-xs">{s?.byStore.shop_a ? fmtH(s.byStore.shop_a) + "h" : ""}</td>
                      <td className="border-b p-2 text-right text-xs">{s?.byStore.shop_b ? fmtH(s.byStore.shop_b) + "h" : ""}</td>
                      <td className="border-b p-2 text-right text-xs">{s?.byStore.shop_c ? fmtH(s.byStore.shop_c) + "h" : ""}</td>
                      <td className="border-b p-2 text-right">
                        {isMonthly
                          ? `月${(emp.monthly_salary ?? 0).toLocaleString()}円`
                          : `時${emp.hourly_wage.toLocaleString()}円`}
                      </td>
                      <td className="border-b p-2 text-right font-medium">
                        {pay && pay > 0 ? `${pay.toLocaleString()}円` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="p-2 text-right font-medium">合計</td>
                  <td className="p-2 text-right font-medium">{fmtH(grandTotal.minutes)}h</td>
                  <td colSpan={4}></td>
                  <td className="p-2 text-right font-bold">{grandTotal.pay.toLocaleString()}円</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        ※ 基本給のみ計算 (残業手当・深夜手当・控除は未実装)。雇用形態が「社員」かつ月給が設定されている場合は月給固定、それ以外は時給×時間で計算。
      </p>
    </div>
  );
}
