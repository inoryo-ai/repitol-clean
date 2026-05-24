import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

/** GET /api/shift/employees → 組織の全従業員 + 店舗別データ */
export async function GET() {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data: emps, error } = await supabase
    .from("shift_employees")
    .select("*, shift_employee_stores(*)")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // 区分順: 社員 → 混合 → アルバイト → その他、同一区分内は履歴出勤数の多い順 → 名前順
  type Row = {
    name: string;
    category: string;
    shift_employee_stores?: Array<{ total_days?: number }>;
  };
  const order: Record<string, number> = { "社員": 0, "混合": 1, "アルバイト": 2 };
  const sorted = ((emps ?? []) as Row[])
    .map((e) => ({
      ...e,
      _order: order[e.category] ?? 9,
      _days: (e.shift_employee_stores ?? []).reduce((s, r) => s + (r.total_days ?? 0), 0),
    }))
    .sort((a, b) => {
      if (a._order !== b._order) return a._order - b._order;
      if (a._days !== b._days) return b._days - a._days;
      return a.name.localeCompare(b.name, "ja");
    });
  return NextResponse.json({ employees: sorted });
}

/** POST /api/shift/employees → 新規 1名追加 (手動登録用) */
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_employees")
    .insert({
      organization_id: orgId,
      name: body.name,
      kana: body.kana ?? null,
      category: body.category ?? "アルバイト",
      employment_type: body.employment_type ?? body.category ?? "アルバイト",
      hourly_wage: body.hourly_wage ?? 1200,
      monthly_salary: body.monthly_salary ?? null,
      notes: body.notes ?? "",
    })
    .select()
    .single();
  if (error) {
    if (typeof error.code === "string" && error.code === "23505") {
      return NextResponse.json(
        { error: `「${body.name}」は既に登録されています` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ employee: data });
}
