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
const DOW_SHORT = ["日", "月", "火", "水", "木", "金", "土"] as const;

interface Assignment {
  id: string;
  plan_id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  role: string | null;
  notes: string;
}
interface Plan {
  id: string;
  store_code: StoreCode;
  week_start: string;
  status: "draft" | "published" | "locked";
  notes: string;
  shift_assignments: Assignment[];
}
interface ShiftRequest {
  id: string;
  employee_id: string;
  date: string;
  request_type: "出勤希望" | "休み希望" | "出勤可" | "出勤不可";
  start_time: string | null;
  end_time: string | null;
  notes: string;
}
interface StaffingRow {
  id: string;
  store_code: StoreCode;
  day_of_week: number;
  start_time: string;
  end_time: string;
  required_count: number;
  role: string | null;
}
interface Employee {
  id: string;
  name: string;
  category: string;
  employment_type: string;
}

function nextMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function durationMin(start: string, end: string, breakMin: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let total = (eh * 60 + em) - (sh * 60 + sm);
  if (total < 0) total += 24 * 60;
  return Math.max(0, total - breakMin);
}

const REQUEST_BADGE: Record<ShiftRequest["request_type"], string> = {
  出勤希望: "bg-blue-100 text-blue-800",
  出勤可: "bg-emerald-50 text-emerald-700",
  休み希望: "bg-rose-100 text-rose-800",
  出勤不可: "bg-rose-200 text-rose-900",
};

export default function ShiftPlanPage() {
  const [store, setStore] = useState<StoreCode>("shop_a");
  const [weekStart, setWeekStart] = useState<string>(nextMonday());
  const [plan, setPlan] = useState<Plan | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [staffing, setStaffing] = useState<StaffingRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const dates = useMemo(() => {
    const out: { date: string; dow: number; label: string }[] = [];
    const d = new Date(weekStart);
    for (let i = 0; i < 7; i++) {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      out.push({
        date: x.toISOString().slice(0, 10),
        dow: x.getDay(),
        label: `${x.getMonth() + 1}/${x.getDate()} (${DOW_SHORT[x.getDay()]})`,
      });
    }
    return out;
  }, [weekStart]);

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/shift/employees");
    const d = await res.json();
    if (res.ok) setEmployees(d.employees ?? []);
  }, []);

  const loadPlan = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/shift/plan?store=${store}&week=${weekStart}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "load failed");
      setPlan(d.plan);
      setRequests(d.requests ?? []);
      setStaffing(d.staffing ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }, [store, weekStart]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);
  useEffect(() => { loadPlan(); }, [loadPlan]);

  async function autoGenerate() {
    if (!plan) return;
    if (!confirm("既存の配置を上書きして自動生成します。よろしいですか?")) return;
    setLoading(true); setError(""); setInfo("");
    try {
      const res = await fetch("/api/shift/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: plan.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "generate failed");
      setInfo(`自動配置 ${d.n_assignments} 件 生成`);
      await loadPlan();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  }

  async function publish() {
    if (!plan) return;
    const next = plan.status === "published" ? "draft" : "published";
    const res = await fetch("/api/shift/plan", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: plan.id, status: next }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "公開失敗");
      return;
    }
    setInfo(next === "published" ? "公開しました" : "下書きに戻しました");
    await loadPlan();
  }

  async function addAssignment(date: string) {
    if (!plan) return;
    const empId = employees[0]?.id;
    if (!empId) return;
    await fetch("/api/shift/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: plan.id, employee_id: empId, date,
        start_time: "11:00", end_time: "15:00",
      }),
    });
    await loadPlan();
  }

  async function patchAssignment(id: string, patch: Partial<Assignment>) {
    await fetch(`/api/shift/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setPlan((p) => p ? {
      ...p,
      shift_assignments: p.shift_assignments.map((a) => a.id === id ? { ...a, ...patch } : a),
    } : p);
  }

  async function deleteAssignment(id: string) {
    await fetch(`/api/shift/assignments/${id}`, { method: "DELETE" });
    setPlan((p) => p ? {
      ...p,
      shift_assignments: p.shift_assignments.filter((a) => a.id !== id),
    } : p);
  }

  async function setRequest(employee_id: string, date: string, request_type: ShiftRequest["request_type"]) {
    setError("");
    const res = await fetch("/api/shift/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employee_id, date, request_type }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "希望保存失敗");
      return;
    }
    await loadPlan();
  }

  // 各日の集計
  const dayStats = useMemo(() => {
    const byDate: Record<string, { assigned: Assignment[]; required: StaffingRow[] }> = {};
    for (const dInfo of dates) {
      const assigned = (plan?.shift_assignments ?? []).filter((a) => a.date === dInfo.date);
      const required = staffing.filter((s) => s.day_of_week === dInfo.dow);
      byDate[dInfo.date] = { assigned, required };
    }
    return byDate;
  }, [plan, staffing, dates]);

  const empById = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of employees) m.set(e.id, e);
    return m;
  }, [employees]);

  // 該当週の従業員ごと総時間
  const weeklyTotalByEmp = useMemo(() => {
    const total: Record<string, number> = {};
    for (const a of plan?.shift_assignments ?? []) {
      const dur = durationMin(a.start_time.slice(0, 5), a.end_time.slice(0, 5), a.break_minutes);
      total[a.employee_id] = (total[a.employee_id] ?? 0) + dur;
    }
    return total;
  }, [plan]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/shift" className="text-sm text-muted-foreground hover:text-foreground">
            &larr; シフト
          </Link>
          <h1 className="text-2xl font-bold">シフト計画</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/shift/staffing" className="text-sm text-primary hover:underline">必要人員設定 →</Link>
          <Link href="/dashboard/shift/employees" className="text-sm text-primary hover:underline">従業員管理 →</Link>
        </div>
      </div>

      {/* === 設定: 店舗 + 週開始 === */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div>
            <label className="mb-1 block text-sm font-medium">店舗</label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value as StoreCode)}
              className="h-9 rounded-md border px-2 text-sm"
            >
              {STORE_CODES.map((s) => <option key={s} value={s}>{STORE_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">週開始 (月曜)</label>
            <Input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className="w-44" />
          </div>
          <Button onClick={autoGenerate} disabled={loading || !plan}>
            {loading ? "..." : "自動配置を生成"}
          </Button>
          {plan && (
            <Button variant={plan.status === "published" ? "outline" : "default"} onClick={publish}>
              {plan.status === "published" ? "下書きに戻す" : "公開"}
            </Button>
          )}
          {plan && (
            <Badge variant={plan.status === "published" ? "default" : "secondary"}>
              状態: {plan.status === "published" ? "公開済" : plan.status === "locked" ? "ロック" : "下書き"}
            </Badge>
          )}
        </CardContent>
      </Card>

      {staffing.length === 0 && (
        <div className="rounded-md border bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-900">必要人員が未設定です</p>
          <p className="text-amber-800">
            自動配置は <Link href="/dashboard/shift/staffing" className="underline">必要人員設定</Link> で曜日×時間帯を登録してから実行してください。
          </p>
        </div>
      )}

      {/* === 7日間 グリッド === */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
        {dates.map((d) => {
          const stat = dayStats[d.date];
          const totalReq = stat.required.reduce((sum, r) => sum + r.required_count, 0);
          const totalAsn = stat.assigned.length;
          const isWeekend = d.dow === 0 || d.dow === 6;
          return (
            <Card key={d.date} className={isWeekend ? "bg-rose-50/30" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {d.label}
                  <Badge variant="outline" className="ml-1 text-xs">
                    {totalAsn}/{totalReq}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {/* 必要人員 */}
                {stat.required.length > 0 && (
                  <div className="rounded border bg-muted/40 p-1 text-[10px] text-muted-foreground">
                    必要: {stat.required.map((r) => `${r.start_time.slice(0, 5)}-${r.end_time.slice(0, 5)}×${r.required_count}`).join(", ")}
                  </div>
                )}

                {/* 配置 */}
                {stat.assigned.map((a) => {
                  const emp = empById.get(a.employee_id);
                  return (
                    <div key={a.id} className="rounded border bg-background p-1 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{emp?.name ?? "?"}</span>
                        <button onClick={() => deleteAssignment(a.id)} className="text-rose-600 hover:text-rose-800">×</button>
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <Input type="time" value={a.start_time.slice(0, 5)} onChange={(e) => patchAssignment(a.id, { start_time: e.target.value })} className="h-7 text-[10px]" />
                        <span>-</span>
                        <Input type="time" value={a.end_time.slice(0, 5)} onChange={(e) => patchAssignment(a.id, { end_time: e.target.value })} className="h-7 text-[10px]" />
                      </div>
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-[10px] text-muted-foreground">休憩</span>
                        <Input type="number" min={0} step={15} value={a.break_minutes} onChange={(e) => patchAssignment(a.id, { break_minutes: Number(e.target.value) })} className="h-7 w-14 text-[10px]" />
                        <span className="text-[10px] text-muted-foreground">分</span>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={() => addAssignment(d.date)}
                  className="w-full rounded border border-dashed px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                >
                  ＋ 追加
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* === 希望シフト 入力 === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">希望シフト (管理者入力)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            紙/口頭で受けた希望をここに入力。配置生成時の優先順位に反映されます。
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="border-b p-1 text-left">従業員</th>
                  {dates.map((d) => (
                    <th key={d.date} className="border-b p-1 text-center">{d.label}</th>
                  ))}
                  <th className="border-b p-1 text-right">週合計</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id}>
                    <td className="border-b p-1 font-medium">
                      {emp.name}
                      <span className="ml-1 text-[10px] text-muted-foreground">{emp.employment_type}</span>
                    </td>
                    {dates.map((d) => {
                      const r = requests.find((x) => x.employee_id === emp.id && x.date === d.date);
                      return (
                        <td key={d.date} className="border-b p-1 text-center">
                          <select
                            value={r?.request_type ?? ""}
                            onChange={(e) => {
                              if (e.target.value) {
                                setRequest(emp.id, d.date, e.target.value as ShiftRequest["request_type"]);
                              }
                            }}
                            className={`w-full rounded border px-1 text-[10px] ${r ? REQUEST_BADGE[r.request_type] : ""}`}
                          >
                            <option value="">-</option>
                            <option value="出勤希望">出勤希望</option>
                            <option value="出勤可">可</option>
                            <option value="休み希望">休み</option>
                            <option value="出勤不可">不可</option>
                          </select>
                        </td>
                      );
                    })}
                    <td className="border-b p-1 text-right">
                      {weeklyTotalByEmp[emp.id] ? fmtMin(weeklyTotalByEmp[emp.id]) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}
    </div>
  );
}
