import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_required_staffing")
    .select("*")
    .eq("organization_id", orgId)
    .order("store_code")
    .order("day_of_week")
    .order("start_time");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staffing: data ?? [] });
}

export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shift_required_staffing")
    .insert({
      organization_id: orgId,
      store_code: body.store_code,
      day_of_week: body.day_of_week,
      start_time: body.start_time,
      end_time: body.end_time,
      required_count: body.required_count ?? 1,
      role: body.role ?? null,
      notes: body.notes ?? "",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staffing: data });
}
