import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&employee_id=xxx */
export async function GET(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const supabase = await createClient();
  let q = supabase.from("shift_time_entries").select("*").eq("organization_id", orgId);
  if (sp.get("from")) q = q.gte("date", sp.get("from")!);
  if (sp.get("to")) q = q.lte("date", sp.get("to")!);
  if (sp.get("employee_id")) q = q.eq("employee_id", sp.get("employee_id")!);
  const { data, error } = await q.order("date").order("start_time");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_time_entries")
    .insert({
      organization_id: orgId,
      employee_id: body.employee_id,
      store_code: body.store_code,
      date: body.date,
      start_time: body.start_time,
      end_time: body.end_time,
      break_minutes: body.break_minutes ?? 0,
      notes: body.notes ?? "",
      source: "manual",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}
