import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopWithLine, getOrganizationId } from "@/lib/auth";
import { sendPushMessage } from "@/lib/line";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const shop = await getShopWithLine();
  const organizationId = await getOrganizationId();
  if (!shop || !organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { customer_id?: string; stamp_card_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { customer_id, stamp_card_id } = body;

  if (!customer_id || !stamp_card_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const supabase = await createClient();

  // 組織内のアクティブなスタンプカード設定を取得
  const { data: card, error: cardErr } = await supabase
    .from("stamp_cards")
    .select("*")
    .eq("id", stamp_card_id)
    .eq("organization_id", organizationId)
    .single();

  if (cardErr || !card) {
    return NextResponse.json({ error: "Stamp card not found" }, { status: 404 });
  }

  // 組織内の顧客を取得
  const { data: customer, error: custErr } = await supabase
    .from("customers")
    .select("line_user_id")
    .eq("id", customer_id)
    .eq("organization_id", organizationId)
    .single();

  if (custErr || !customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // L01修正: アトミック操作でスタンプをインクリメント
  const { data: stampResult, error: stampError } = await supabase
    .rpc("atomic_increment_stamp", {
      p_stamp_card_id: stamp_card_id,
      p_customer_id: customer_id,
      p_shop_id: shop.id,
      p_total_stamps: card.total_stamps,
      p_mid_stamps: card.mid_stamps ?? null,
    });

  if (stampError || !stampResult?.[0]) {
    console.error("Stamp increment error:", stampError?.message);
    return NextResponse.json({ error: "Failed to update stamp" }, { status: 500 });
  }

  const stamp = stampResult[0];
  let currentStamps = stamp.new_current_stamps;
  let completedCount = stamp.new_completed_count;
  let midRewardClaimed = stamp.new_mid_reward_claimed;
  let rewardType: "none" | "mid" | "full" = "none";

  if (currentStamps >= card.total_stamps) {
    rewardType = "full";

    const { data: stampRow } = await supabase
      .from("customer_stamps")
      .select("id")
      .eq("stamp_card_id", stamp_card_id)
      .eq("customer_id", customer_id)
      .single();

    if (stampRow) {
      await supabase.rpc("reset_stamp_on_complete", { p_stamp_id: stampRow.id });
    }

    currentStamps = 0;
    completedCount += 1;
    midRewardClaimed = false;

    if (card.full_reward_group_id) {
      await issueCouponGroup(supabase, card.full_reward_group_id, customer_id, shop.id, organizationId);
    } else if (card.reward_coupon_template_id) {
      await issueCoupon(supabase, card.reward_coupon_template_id, customer_id, shop.id, organizationId);
    }

    if (shop.line_channel_access_token && customer.line_user_id) {
      await sendPushMessage(shop.line_channel_access_token, customer.line_user_id, [
        {
          type: "text",
          text: `スタンプカードコンプリート!\n${card.total_stamps}個達成の特典クーポンをお送りしました。おめでとうございます!`,
        },
      ]);
    }
  } else if (
    card.mid_stamps &&
    (card.mid_reward_group_id || card.mid_reward_coupon_template_id) &&
    currentStamps >= card.mid_stamps &&
    !midRewardClaimed
  ) {
    rewardType = "mid";

    const { data: stampRow } = await supabase
      .from("customer_stamps")
      .select("id")
      .eq("stamp_card_id", stamp_card_id)
      .eq("customer_id", customer_id)
      .single();

    if (stampRow) {
      await supabase.rpc("claim_mid_reward", { p_stamp_id: stampRow.id });
    }

    midRewardClaimed = true;

    if (card.mid_reward_group_id) {
      await issueCouponGroup(supabase, card.mid_reward_group_id, customer_id, shop.id, organizationId);
    } else if (card.mid_reward_coupon_template_id) {
      await issueCoupon(supabase, card.mid_reward_coupon_template_id, customer_id, shop.id, organizationId);
    }

    if (shop.line_channel_access_token && customer.line_user_id) {
      await sendPushMessage(shop.line_channel_access_token, customer.line_user_id, [
        {
          type: "text",
          text: `スタンプ${card.mid_stamps}個達成おめでとうございます!\n特典クーポンをお送りしました。次回ご来店時にご利用ください!`,
        },
      ]);
    }
  }

  if (rewardType === "none" && shop.line_channel_access_token && customer.line_user_id) {
    const remaining = card.total_stamps - currentStamps;
    const midRemaining = card.mid_stamps && !midRewardClaimed
      ? card.mid_stamps - currentStamps
      : null;

    let msg = `スタンプ${currentStamps}/${card.total_stamps}個になりました!`;
    if (midRemaining !== null && midRemaining > 0) {
      msg += `\nあと${midRemaining}個で特典GET!`;
    } else {
      msg += `\nあと${remaining}個でコンプリート!`;
    }

    await sendPushMessage(shop.line_channel_access_token, customer.line_user_id, [
      { type: "text", text: msg },
    ]);
  }

  return NextResponse.json({
    success: true,
    current_stamps: currentStamps,
    completed_count: completedCount,
    reward_type: rewardType,
  });
}

async function issueCoupon(
  supabase: Awaited<ReturnType<typeof createClient>>,
  templateId: string,
  customerId: string,
  shopId: string,
  organizationId: string,
  exclusiveGroupId: string | null = null,
) {
  const { data: template } = await supabase
    .from("coupon_templates")
    .select("valid_days")
    .eq("id", templateId)
    .single();

  const validDays = template?.valid_days ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validDays);

  const { error } = await supabase.from("coupons_issued").insert({
    template_id: templateId,
    customer_id: customerId,
    shop_id: shopId,
    organization_id: organizationId,
    status: "active",
    issued_at: new Date().toISOString(),
    expires_at: expiresAt.toISOString(),
    coupon_code: crypto.randomUUID().slice(0, 8).toUpperCase(),
    exclusive_group_id: exclusiveGroupId,
  });

  if (error) {
    console.error("Coupon issuance error:", error.message);
  }
}

async function issueCouponGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rewardGroupId: string,
  customerId: string,
  shopId: string,
  organizationId: string,
) {
  const { data: entries, error: groupErr } = await supabase
    .from("coupon_group_templates")
    .select("template_id")
    .eq("group_id", rewardGroupId)
    .order("sort_order", { ascending: true });

  if (groupErr || !entries || entries.length === 0) {
    console.error("Coupon group empty:", rewardGroupId, groupErr?.message);
    return;
  }

  // 排他グループは付与しない（各クーポンが独立して使えるよう個別発行）
  for (const { template_id } of entries) {
    await issueCoupon(supabase, template_id, customerId, shopId, organizationId, null);
  }
}
