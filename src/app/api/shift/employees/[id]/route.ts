import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json();
  const supabase = await createClient();

  // 既存行を読み、名前が変更ない場合は name を update から除外
  const { data: cur } = await supabase
    .from("shift_employees")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string" && body.name !== cur.name) update.name = body.name;
  if ("kana" in body) update.kana = body.kana ?? null;
  if ("category" in body) update.category = body.category;
  if ("employment_type" in body) update.employment_type = body.employment_type;
  if ("hourly_wage" in body) update.hourly_wage = body.hourly_wage ?? 0;
  if ("monthly_salary" in body) update.monthly_salary = body.monthly_salary;
  if ("notes" in body) update.notes = body.notes ?? "";
  if ("is_active" in body) update.is_active = body.is_active;

  const { data, error } = await supabase
    .from("shift_employees")
    .update(update)
    .eq("id", id)
    .eq("organization_id", orgId)
    .select()
    .single();
  if (error) {
    // 23505: unique violation
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const supabase = await createClient();
  // soft delete
  const { error } = await supabase
    .from("shift_employees")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
