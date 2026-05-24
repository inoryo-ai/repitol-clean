import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopId, getOrganizationId } from "@/lib/auth";
import { sendPushMessage, type LineMessage } from "@/lib/line";
import crypto from "crypto";

const MAX_BROADCAST_RECIPIENTS = 500;

export async function POST(request: NextRequest) {
  const fallbackShopId = await getShopId();
  const organizationId = await getOrganizationId();
  if (!fallbackShopId || !organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    shop_id?: string;
    customer_ids?: string[];
    message_text?: string | null;
    image_url?: string | null;
    coupon_template_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customer_ids, message_text, image_url, coupon_template_id } = body;
  let shopId = body.shop_id ?? fallbackShopId;

  if (!customer_ids?.length) {
    return NextResponse.json({ error: "Missing customer_ids" }, { status: 400 });
  }
  if (!message_text?.trim() && !image_url && !coupon_template_id) {
    return NextResponse.json(
      { error: "テキスト・画像・クーポンのどれかが必要です" },
      { status: 400 }
    );
  }

  if (body.shop_id) {
    const supa0 = await createClient();
    const { data: shopCheck } = await supa0
      .from("shops").select("organization_id")
      .eq("id", body.shop_id).single();
    if (!shopCheck || shopCheck.organization_id !== organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    shopId = body.shop_id;
  }

  if (customer_ids.length > MAX_BROADCAST_RECIPIENTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_BROADCAST_RECIPIENTS} recipients per broadcast` },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("line_channel_access_token, messages_sent_this_month, messages_limit")
    .eq("id", shopId)
    .single();

  if (shopError || !shop?.line_channel_access_token) {
    return NextResponse.json({ error: "LINE not configured" }, { status: 400 });
  }

  const remaining = shop.messages_limit - shop.messages_sent_this_month;
  if (remaining <= 0) {
    return NextResponse.json({ error: "Monthly message limit reached" }, { status: 429 });
  }

  // 014: customer_shop_memberships で絞り込み
  const { data: memberships } = await supabase
    .from("customer_shop_memberships")
    .select("customer_id")
    .eq("shop_id", shopId)
    .eq("is_blocked", false)
    .in("customer_id", customer_ids);
  const memberSet = new Set((memberships ?? []).map((m) => m.customer_id));

  const { data: customers } = await supabase
    .from("customers")
    .select("id, line_user_id")
    .in("id", customer_ids)
    .eq("organization_id", organizationId)
    .eq("is_blocked", false);

  const validCustomers = (customers ?? []).filter((c) => memberSet.has(c.id));
  if (!validCustomers.length) {
    return NextResponse.json({ error: "No valid customers found" }, { status: 400 });
  }

  // クーポン添付時: template 情報取得
  let couponTemplate: { id: string; title: string; valid_days: number } | null = null;
  if (coupon_template_id) {
    const { data: tpl } = await supabase
      .from("coupon_templates")
      .select("id, title, valid_days")
      .eq("id", coupon_template_id)
      .eq("organization_id", organizationId)
      .single();
    if (!tpl) {
      return NextResponse.json({ error: "Coupon template not found" }, { status: 404 });
    }
    couponTemplate = tpl;
  }

  const toSend = validCustomers.slice(0, remaining);
  let successCount = 0;
  let failCount = 0;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://repitol.vercel.app";
  const siteOrigin = baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
  const absoluteImageUrl = image_url
    ? (image_url.startsWith("http") ? image_url : `${siteOrigin}${image_url}`)
    : null;

  for (const customer of toSend) {
    if (!customer.line_user_id) { failCount++; continue; }

    // クーポン発行（必要な場合）
    if (couponTemplate) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (couponTemplate.valid_days ?? 30));
      await supabase.from("coupons_issued").insert({
        template_id: couponTemplate.id,
        customer_id: customer.id,
        shop_id: shopId,
        organization_id: organizationId,
        status: "active",
        issued_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        coupon_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
      });
    }

    // メッセージ構築
    const messages: LineMessage[] = [];
    if (absoluteImageUrl) {
      messages.push({
        type: "image",
        originalContentUrl: absoluteImageUrl,
        previewImageUrl: absoluteImageUrl,
      });
    }
    const textParts: string[] = [];
    if (message_text?.trim()) textParts.push(message_text.trim());
    if (couponTemplate) {
      textParts.push(
        `クーポン「${couponTemplate.title}」をプレゼントしました！\n` +
        `メニューの「クーポン」からご確認ください。`
      );
    }
    if (textParts.length > 0) {
      messages.push({ type: "text", text: textParts.join("\n\n") });
    }

    if (messages.length === 0) { failCount++; continue; }

    const result = await sendPushMessage(
      shop.line_channel_access_token,
      customer.line_user_id,
      messages
    );

    const logContent = [
      message_text ?? "",
      absoluteImageUrl ? `[画像: ${absoluteImageUrl}]` : "",
      couponTemplate ? `[クーポン: ${couponTemplate.title}]` : "",
    ].filter(Boolean).join(" ");

    await supabase.from("message_logs").insert({
      shop_id: shopId,
      organization_id: organizationId,
      customer_id: customer.id,
      message_type: "broadcast",
      content: logContent,
      sent_at: new Date().toISOString(),
      success: result.success,
      error_message: result.error ?? null,
    });

    if (result.success) successCount++;
    else failCount++;
  }

  if (successCount > 0) {
    const { error: countError } = await supabase.rpc("atomic_increment_message_count", {
      p_shop_id: shopId,
      p_count: successCount,
    });
    if (countError) console.error("Message count update error:", countError.message);
  }

  return NextResponse.json({
    success: successCount,
    fail: failCount,
    total: toSend.length,
  });
}
