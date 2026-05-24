import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopId, getOrganizationId } from "@/lib/auth";
import { z } from "zod";

// A02修正: Zodバリデーション導入
// A04修正: party_sizeの正常範囲チェック
// A05修正: 過去日付チェック
const createReservationSchema = z.object({
  customer_name: z.string().min(1, "顧客名は必須です"),
  customer_phone: z.string().optional(),
  line_user_id: z.string().optional(),
  party_size: z.number().int().min(1, "人数は1以上").max(100, "人数は100以下"),
  reserved_at: z.string().refine((val) => {
    const date = new Date(val);
    return !isNaN(date.getTime()) && date > new Date();
  }, "予約日時は未来の日付を指定してください"),
  memo: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const shopId = await getShopId();
  const organizationId = await getOrganizationId();
  if (!shopId || !organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { customer_name, customer_phone, line_user_id, party_size, reserved_at, memo } = parsed.data;

  const supabase = await createClient();

  let customerId: string | null = null;
  if (line_user_id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("line_user_id", line_user_id)
      .maybeSingle();
    customerId = customer?.id ?? null;
  }

  const { data, error } = await supabase
    .from("reservations")
    .insert({
      shop_id: shopId,
      organization_id: organizationId,
      customer_id: customerId,
      customer_name,
      customer_phone: customer_phone ?? null,
      line_user_id: line_user_id ?? null,
      party_size,
      reserved_at,
      status: "confirmed",
      memo: memo ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
