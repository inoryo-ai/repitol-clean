import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/shift/plan/generate
 *  body: { plan_id }
 *  staffing × requests × employees から greedy 配置を生成し、
 *  shift_assignments を上書きする。
 */
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const planId = body.plan_id;
  if (!planId) return NextResponse.json({ error: "plan_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("shift_plans").select("*").eq("id", planId).eq("organization_id", orgId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });

  // 該当週の日付配列
  const start = new Date(plan.week_start);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // 必要人員 (店舗 + アクティブ)
  const { data: staffing } = await supabase
    .from("shift_required_staffing")
    .select("*")
    .eq("organization_id", orgId)
    .eq("store_code", plan.store_code)
    .eq("is_active", true);

  // 希望シフト
  const { data: requests } = await supabase
    .from("shift_requests")
    .select("*")
    .eq("organization_id", orgId)
    .gte("date", dates[0])
    .lte("date", dates[6]);

  // 当該店舗で投入可の従業員 + 既定制約
  const { data: rows } = await supabase
    .from("shift_employee_stores")
    .select("*, shift_employees!inner(id, name, organization_id, is_active, employment_type)")
    .eq("store_code", plan.store_code)
    .eq("default_enabled", true);
  type EmpRow = {
    id: string;
    employee_id: string;
    default_weekly_days: number;
    default_shift_length_slots: number;
    default_time_band: string;
    default_day_policy: string;
    default_allowed_days: string[];
    default_excluded_days: string[];
    preferred_days: string[];
    preferred_time_band: string;
    shift_employees: { id: string; name: string; organization_id: string; is_active: boolean };
  };
  const candidates: EmpRow[] = ((rows ?? []) as EmpRow[]).filter(
    (r) => r.shift_employees.organization_id === orgId
        && r.shift_employees.is_active,
  );

  // 配置決定
  type Assign = {
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    role: string | null;
  };
  type ReqRow = {
    id: string; employee_id: string; date: string;
    request_type: "出勤希望" | "休み希望" | "出勤可" | "出勤不可";
    start_time: string | null; end_time: string | null;
  };
  const assignments: Assign[] = [];
  const empAssignedDays: Record<string, Set<string>> = {};
  const reqByEmpDate = new Map<string, ReqRow>();
  for (const r of (requests ?? []) as ReqRow[]) reqByEmpDate.set(`${r.employee_id}|${r.date}`, r);

  const DOW_LABEL = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"];

  for (const s of staffing ?? []) {
    // この staffing 行が満たすべき: 該当 day_of_week の date を取り、required_count 名を埋める
    for (const d of dates) {
      const dt = new Date(d);
      if (dt.getDay() !== s.day_of_week) continue;

      // 候補者を絞る
      const dayLabel = DOW_LABEL[dt.getDay()];
      const eligible = candidates.filter((c) => {
        const k = `${c.employee_id}|${d}`;
        const req = reqByEmpDate.get(k);
        // 休み希望 / 出勤不可は除外
        if (req && (req.request_type === "休み希望" || req.request_type === "出勤不可")) return false;
        // 週上限チェック
        const used = empAssignedDays[c.employee_id]?.size ?? 0;
        if (used >= c.default_weekly_days) return false;
        // 曜日方針
        if (c.default_excluded_days.includes(dayLabel)) return false;
        if (c.default_day_policy === "specific" && c.default_allowed_days.length > 0
            && !c.default_allowed_days.includes(dayLabel)) return false;
        if (c.default_day_policy === "weekday" && (dt.getDay() === 0 || dt.getDay() === 6)) return false;
        if (c.default_day_policy === "weekend" && dt.getDay() !== 0 && dt.getDay() !== 6) return false;
        return true;
      });

      // 並び替え: 出勤希望 > preferred_days 該当 > 時間帯 match
      const scored = eligible.map((c) => {
        const k = `${c.employee_id}|${d}`;
        const req = reqByEmpDate.get(k);
        let score = 0;
        if (req && req.request_type === "出勤希望") score += 10;
        if (req && req.request_type === "出勤可") score += 3;
        if (c.preferred_days?.includes(dayLabel)) score += 5;
        // 時間帯 (h: staffing の start_time 帯)
        const hour = parseInt(s.start_time.slice(0, 2), 10);
        const empBand = c.preferred_time_band;
        if ((hour < 12 && empBand === "morning")
            || (hour >= 12 && hour < 17 && empBand === "lunch")
            || (hour >= 17 && empBand === "evening")) score += 3;
        // 残り使用可能日数を逆数 (まんべんなく回すため)
        const used = empAssignedDays[c.employee_id]?.size ?? 0;
        const remaining = c.default_weekly_days - used;
        score += remaining;
        return { c, score };
      });
      scored.sort((a, b) => b.score - a.score);

      const take = scored.slice(0, s.required_count);
      for (const { c } of take) {
        assignments.push({
          employee_id: c.employee_id,
          date: d,
          start_time: s.start_time,
          end_time: s.end_time,
          role: s.role ?? null,
        });
        if (!empAssignedDays[c.employee_id]) empAssignedDays[c.employee_id] = new Set();
        empAssignedDays[c.employee_id].add(d);
      }
    }
  }

  // DB上書き
  await supabase.from("shift_assignments").delete().eq("plan_id", planId);
  if (assignments.length > 0) {
    const { error } = await supabase.from("shift_assignments").insert(
      assignments.map((a) => ({ ...a, plan_id: planId, break_minutes: 0, notes: "" })),
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, n_assignments: assignments.length });
}
