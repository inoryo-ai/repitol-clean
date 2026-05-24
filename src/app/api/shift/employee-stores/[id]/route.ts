import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * PATCH /api/shift/employee-stores/:id
 *  従業員×店舗 の既定制約を更新 (default_*)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const supabase = await createClient();

  // 所属組織チェック (employee_id 経由)
  const { data: row } = await supabase
    .from("shift_employee_stores")
    .select("employee_id, shift_employees!inner(organization_id)")
    .eq("id", id)
    .single();
  type Row = { shift_employees: { organization_id: string } | { organization_id: string }[] } | null;
  const r = row as Row;
  const orgs = r?.shift_employees;
  const ownerOrg = Array.isArray(orgs) ? orgs[0]?.organization_id : orgs?.organization_id;
  if (ownerOrg !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = [
    "default_enabled",
    "default_weekly_days",
    "default_time_band",
    "default_day_policy",
    "default_allowed_days",
    "default_excluded_days",
    "default_shift_length_slots",
    "is_active",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in body) update[k] = body[k];
  }
  const { data, error } = await supabase
    .from("shift_employee_stores")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ store: data });
}
