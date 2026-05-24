import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const supabase = await createClient();
  // plan が org のものか確認
  const { data: plan } = await supabase
    .from("shift_plans").select("id, organization_id")
    .eq("id", body.plan_id).eq("organization_id", orgId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await supabase
    .from("shift_assignments")
    .insert({
      plan_id: body.plan_id,
      employee_id: body.employee_id,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      break_minutes: body.break_minutes ?? 0,
      role: body.role ?? null,
      notes: body.notes ?? "",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ assignment: data });
}

/** PATCH /api/shift/assignments?bulk_replace=plan_id  body: { assignments: [...] } */
export async function PATCH(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const planId = body.plan_id;
  const list = body.assignments as Array<{
    employee_id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes?: number;
    role?: string;
    notes?: string;
  }>;
  if (!planId || !Array.isArray(list)) return NextResponse.json({ error: "plan_id, assignments required" }, { status: 400 });
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("shift_plans").select("id, organization_id")
    .eq("id", planId).eq("organization_id", orgId).maybeSingle();
  if (!plan) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // 既存削除 → 新規一括 insert
  await supabase.from("shift_assignments").delete().eq("plan_id", planId);
  if (list.length > 0) {
    const rows = list.map((a) => ({
      plan_id: planId,
      employee_id: a.employee_id,
      date: a.date,
      start_time: a.start_time,
      end_time: a.end_time,
      break_minutes: a.break_minutes ?? 0,
      role: a.role ?? null,
      notes: a.notes ?? "",
    }));
    const { error } = await supabase.from("shift_assignments").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, n: list.length });
}
