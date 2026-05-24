import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { sendPushMessage } from "@/lib/line";

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

/**
 * 月次クーポン自動配布
 * POST /api/coupons/monthly
 * Header: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  // S05修正: CRON_SECRET未設定時はアクセス拒否
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: triggers, error: triggerError } = await supabase
    .from("auto_triggers")
    .select("shop_id, coupon_template_id, message_text, trigger_value")
    .eq("trigger_type", "nth_visit")
    .eq("trigger_value", -1)
    .eq("is_active", true);

  if (triggerError) {
    console.error("Trigger fetch error:", triggerError.message);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  if (!triggers || triggers.length === 0) {
    return NextResponse.json({ message: "No monthly triggers configured", processed: 0 });
  }

  let totalProcessed = 0;

  for (const trigger of triggers) {
    const { data: shop } = await supabase
      .from("shops")
      .select("name, line_channel_access_token")
      .eq("id", trigger.shop_id)
      .single();

    if (!shop) continue;

    const { data: customers } = await supabase
      .from("customers")
      .select("id, line_user_id, first_visit_at")
      .eq("shop_id", trigger.shop_id)
      .eq("is_blocked", false);

    if (!customers) continue;

    const now = new Date();

    // D05/D06改善: 既存ログを一括取得してN+1を削減
    const customerIds = customers.map(c => c.id);
    const { data: existingLogs } = await supabase
      .from("monthly_coupon_log")
      .select("customer_id, month_number")
      .eq("shop_id", trigger.shop_id)
      .in("customer_id", customerIds);

    const logSet = new Set(
      (existingLogs ?? []).map(l => `${l.customer_id}:${l.month_number}`)
    );

    // テンプレートも一括取得
    const { data: template } = await supabase
      .from("coupon_templates")
      .select("title, valid_days")
      .eq("id", trigger.coupon_template_id)
      .single();

    for (const customer of customers) {
      const registeredAt = new Date(customer.first_visit_at);
      const monthsSinceRegistration = monthDiff(registeredAt, now);

      if (monthsSinceRegistration < 1) continue;

      // 既存ログチェック（メモリ内）
      if (logSet.has(`${customer.id}:${monthsSinceRegistration}`)) continue;

      const validDays = template?.valid_days ?? 30;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + validDays);
      const couponCode = crypto.randomUUID().slice(0, 8).toUpperCase();

      // E06修正: エラーハンドリング追加
      const { error: couponError } = await supabase.from("coupons_issued").insert({
        template_id: trigger.coupon_template_id,
        customer_id: customer.id,
        shop_id: trigger.shop_id,
        status: "active",
        issued_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        coupon_code: couponCode,
      });

      if (couponError) {
        console.error("Monthly coupon insert error:", couponError.message);
        continue;
      }

      const { error: logError } = await supabase.from("monthly_coupon_log").insert({
        shop_id: trigger.shop_id,
        customer_id: customer.id,
        coupon_template_id: trigger.coupon_template_id,
        month_number: monthsSinceRegistration,
      });

      if (logError) {
        console.error("Monthly log insert error:", logError.message);
        continue;
      }

      if (shop.line_channel_access_token && customer.line_user_id) {
        const msg = trigger.message_text ||
          `${shop.name}をご利用いただき${monthsSinceRegistration}ヶ月!\n\n感謝の気持ちを込めて「${template?.title}」クーポンをプレゼント!\n\nクーポンコード: ${couponCode}\n有効期限: ${validDays}日間\n\n次回ご来店時にスタッフにご提示ください。`;

        await sendPushMessage(shop.line_channel_access_token, customer.line_user_id, [
          { type: "text", text: msg },
        ]);
      }

      totalProcessed++;
    }
  }

  return NextResponse.json({ success: true, processed: totalProcessed });
}

// L05修正: 日付も考慮したmonthDiff
function monthDiff(from: Date, to: Date): number {
  const months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // 日が登録日より前なら1ヶ月減らす
  if (to.getDate() < from.getDate()) {
    return Math.max(0, months - 1);
  }
  return Math.max(0, months);
}
