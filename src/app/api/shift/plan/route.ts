import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/shift/plan?store=shop_a&week=YYYY-MM-DD
 *  店舗 × 週開始日 の plan + assignments + 該当週の requests を返す
 */
export async function GET(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const store = sp.get("store");
  const week = sp.get("week");
  if (!store || !week) return NextResponse.json({ error: "store, week required" }, { status: 400 });
  const supabase = await createClient();

  // 既存 plan 取得 (なければ作る)
  let { data: plan } = await supabase
    .from("shift_plans")
    .select("*, shift_assignments(*)")
    .eq("organization_id", orgId)
    .eq("store_code", store)
    .eq("week_start", week)
    .maybeSingle();
  if (!plan) {
    const { data: created, error } = await supabase
      .from("shift_plans")
      .insert({ organization_id: orgId, store_code: store, week_start: week })
      .select("*, shift_assignments(*)")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    plan = created;
  }

  // 該当週(月-日 7日間)の requests
  const start = new Date(week);
  const end = new Date(start); end.setDate(start.getDate() + 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const { data: requests } = await supabase
    .from("shift_requests")
    .select("*")
    .eq("organization_id", orgId)
    .gte("date", startStr)
    .lte("date", endStr);

  // 必要人員 (店舗の)
  const { data: staffing } = await supabase
    .from("shift_required_staffing")
    .select("*")
    .eq("organization_id", orgId)
    .eq("store_code", store)
    .eq("is_active", true);

  return NextResponse.json({ plan, requests: requests ?? [], staffing: staffing ?? [] });
}

/** PATCH /api/shift/plan — plan の status / notes を変更 */
export async function PATCH(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = await createClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("status" in body) {
    update.status = body.status;
    if (body.status === "published") update.published_at = new Date().toISOString();
  }
  if ("notes" in body) update.notes = body.notes;
  const { data, error } = await supabase
    .from("shift_plans")
    .update(update)
    .eq("id", body.id)
    .eq("organization_id", orgId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}
