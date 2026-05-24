import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopId } from "@/lib/auth";
import { sendPushMessage } from "@/lib/line";
import crypto from "crypto";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await params;
  const shopId = await getShopId();
  if (!shopId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  // S08修正: shop_idでフィルタリング
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("shop_id", shopId)
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // L02修正: アトミックな来店カウント更新
  const { data: newVisitCount, error: incrError } = await supabase.rpc(
    "atomic_increment_visit_count",
    { p_customer_id: customerId }
  );

  if (incrError) {
    console.error("Visit count increment error:", incrError.message);
    return NextResponse.json({ error: "Failed to update visit count" }, { status: 500 });
  }

  // E03修正: visit logのエラーハンドリング
  const now = new Date().toISOString();
  const { error: visitLogError } = await supabase.from("visit_logs").insert({
    customer_id: customerId,
    shop_id: shopId,
    visited_at: now,
  });

  if (visitLogError) {
    console.error("Visit log insert error:", visitLogError.message);
  }

  // Check auto triggers
  const { data: triggers } = await supabase
    .from("auto_triggers")
    .select("*, coupon_templates(title, coupon_type, discount_value, valid_days)")
    .eq("shop_id", shopId)
    .eq("is_active", true);

  // shop情報をループ外で1回だけ取得（N+1防止）
  const { data: shop } = await supabase
    .from("shops")
    .select("line_channel_access_token")
    .eq("id", shopId)
    .single();

  const triggersFired: string[] = [];

  for (const trigger of triggers ?? []) {
    let shouldFire = false;

    // L04修正: visit_countベースで初回判定
    // webhook側で初回クーポン発行済みの場合は二重発行しない
    if (trigger.trigger_type === "first_visit" && newVisitCount === 1) {
      if (trigger.coupon_template_id) {
        const { count } = await supabase
          .from("coupons_issued")
          .select("*", { count: "exact", head: true })
          .eq("template_id", trigger.coupon_template_id)
          .eq("customer_id", customerId)
          .eq("shop_id", shopId);
        if ((count ?? 0) > 0) continue; // webhook側で発行済み→スキップ
      }
      shouldFire = true;
    }
    if (trigger.trigger_type === "nth_visit" && trigger.trigger_value > 0 && newVisitCount === trigger.trigger_value) {
      shouldFire = true;
    }

    if (shouldFire && trigger.coupon_template_id) {
      const template = trigger.coupon_templates as {
        title: string; valid_days: number;
      } | null;
      const validDays = template?.valid_days ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validDays);

      const { error: couponError } = await supabase.from("coupons_issued").insert({
        template_id: trigger.coupon_template_id,
        customer_id: customerId,
        shop_id: shopId,
        status: "active",
        issued_at: now,
        expires_at: expiresAt.toISOString(),
        coupon_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      });

      if (couponError) {
        console.error("Coupon issuance error:", couponError.message);
        continue;
      }

      // Send LINE message if configured
      if (trigger.message_text && customer.line_user_id && shop?.line_channel_access_token) {
        await sendPushMessage(
          shop.line_channel_access_token,
          customer.line_user_id,
          [{ type: "text", text: trigger.message_text }]
        );
      }

      triggersFired.push(template?.title ?? trigger.id);
    }
  }

  return NextResponse.json({ success: true, visit_count: newVisitCount, triggers_fired: triggersFired });
}
