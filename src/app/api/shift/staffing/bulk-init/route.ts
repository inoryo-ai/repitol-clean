import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/shift/staffing/bulk-init
 *  body: { store_code, start_time?, end_time?, required_count? }
 *  指定店舗に 7 曜日分のデフォルト行 (各曜日 1 行) を作成。
 *  既存行は触らない (同じ曜日が既にある場合はスキップ)。
 */
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const store = body.store_code;
  if (!store) return NextResponse.json({ error: "store_code required" }, { status: 400 });
  const start = body.start_time ?? "11:00";
  const end = body.end_time ?? "15:00";
  const count = body.required_count ?? 2;

  const supabase = await createClient();
  // 既存の day_of_week
  const { data: existing } = await supabase
    .from("shift_required_staffing")
    .select("day_of_week")
    .eq("organization_id", orgId)
    .eq("store_code", store);
  const existingDows = new Set(((existing ?? []) as Array<{ day_of_week: number }>).map((r) => r.day_of_week));

  const toInsert: Array<{
    organization_id: string;
    store_code: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    required_count: number;
  }> = [];
  for (let dow = 0; dow < 7; dow++) {
    if (existingDows.has(dow)) continue;
    toInsert.push({
      organization_id: orgId,
      store_code: store,
      day_of_week: dow,
      start_time: start,
      end_time: end,
      required_count: count,
    });
  }
  if (toInsert.length === 0) {
    return NextResponse.json({ success: true, n_inserted: 0, message: "全曜日が既に設定済" });
  }
  const { error } = await supabase.from("shift_required_staffing").insert(toInsert);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, n_inserted: toInsert.length });
}
