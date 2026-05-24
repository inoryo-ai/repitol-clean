import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopId } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: couponId } = await params;
  const shopId = await getShopId();
  if (!shopId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { coupon_code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { coupon_code } = body;

  const supabase = await createClient();

  const { data: coupon, error: fetchErr } = await supabase
    .from("coupons_issued")
    .select("*")
    .eq("id", couponId)
    .eq("shop_id", shopId)
    .single();

  if (fetchErr || !coupon) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  if (coupon.coupon_code !== coupon_code) {
    return NextResponse.json({ error: "Invalid coupon code" }, { status: 400 });
  }

  if (coupon.status === "used") {
    return NextResponse.json({ error: "Coupon already used" }, { status: 400 });
  }

  if (new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ error: "Coupon expired" }, { status: 400 });
  }

  const { error: updateErr } = await supabase
    .from("coupons_issued")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", couponId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // 010: 排他的グループに属する場合、同一グループの他クーポンを失効
  if (coupon.exclusive_group_id) {
    await supabase
      .from("coupons_issued")
      .update({ status: "expired" })
      .eq("exclusive_group_id", coupon.exclusive_group_id)
      .eq("status", "active")
      .neq("id", couponId);
  }

  return NextResponse.json({ success: true });
}
