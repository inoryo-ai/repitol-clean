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
 * QRコードスキャンによるスタンプ付与
 * POST /api/stamps/scan
 * Body: { shop_id, line_user_id, liff_token }
 *
 * S04修正: LIFF IDトークン検証を追加
 */
export async function POST(request: NextRequest) {
  let body: { shop_id?: string; shop_code?: string; line_user_id?: string; liff_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { shop_code, line_user_id, liff_token } = body;
  let { shop_id } = body;

  if ((!shop_id && !shop_code) || !line_user_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // LIFFトークンがある場合は検証（オプション）
  const liffChannelId = process.env.LIFF_CHANNEL_ID;
  if (liffChannelId && liff_token) {
    const verified = await verifyLiffToken(liff_token, liffChannelId, line_user_id);
    if (!verified) {
      return NextResponse.json({ error: "Invalid LIFF token" }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  // 012: shop_code が来ている場合は shop_id に解決
  if (!shop_id && shop_code) {
    const { data: resolved } = await supabase
      .from("shops")
      .select("id")
      .eq("code", shop_code)
      .single();
    if (!resolved) {
      return NextResponse.json({ error: "Invalid shop code" }, { status: 404 });
    }
    shop_id = resolved.id;
  }

  if (!shop_id) {
    return NextResponse.json({ error: "Shop not resolved" }, { status: 400 });
  }
  const resolvedShopId: string = shop_id;

  // 011: shop → organization_id 解決。スタンプ・顧客・カードは組織スコープで扱う
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("id, code, name, organization_id, line_channel_access_token")
    .eq("id", resolvedShopId)
    .single();

  if (shopError || !shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const organizationId = shop.organization_id;
  if (!organizationId) {
    return NextResponse.json({ error: "Shop has no organization" }, { status: 500 });
  }

  // Get customer (組織単位)
  const { data: customer, error: custError } = await supabase
    .from("customers")
    .select("id, line_user_id, display_name")
    .eq("organization_id", organizationId)
    .eq("line_user_id", line_user_id)
    .single();

  if (custError || !customer) {
    return NextResponse.json({
      error: "Customer not found. Please add our LINE friend first.",
      error_ja: "まずLINE友だち追加をお願いします。",
    }, { status: 404 });
  }

  // Get active stamp card (組織共通カード)
  const { data: card, error: cardError } = await supabase
    .from("stamp_cards")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .single();

  if (cardError || !card) {
    return NextResponse.json({ error: "No active stamp card" }, { status: 404 });
  }

  // クールダウン制限（テスト中のため無効化）
  // TODO: テスト完了後に12時間クールダウンを復活させる
  // const cooldownStart = new Date(Date.now() - 12 * 60 * 60 * 1000);
  //
  // const { count: recentVisits, error: visitCheckError } = await supabase
  //   .from("visit_logs")
  //   .select("*", { count: "exact", head: true })
  //   .eq("customer_id", customer.id)
  //   .eq("shop_id", shop_id)
  //   .gte("visited_at", cooldownStart.toISOString());
  //
  // if (visitCheckError) {
  //   console.error("Visit check error:", visitCheckError.message);
  // }
  //
  // if ((recentVisits ?? 0) > 0) {
  //   return NextResponse.json({
  //     success: false,
  //     error: "already_stamped_recently",
  //     error_ja: "前回のスタンプから12時間経っていません。またのご来店をお待ちしております!",
  //   }, { status: 429 });
  // }

  // L01修正: アトミック操作でスタンプをインクリメント
  const { data: stampResult, error: stampError } = await supabase
    .rpc("atomic_increment_stamp", {
      p_stamp_card_id: card.id,
      p_customer_id: customer.id,
      p_shop_id: resolvedShopId,
      p_total_stamps: card.total_stamps,
      p_mid_stamps: card.mid_stamps ?? null,
    });

  if (stampError || !stampResult?.[0]) {
    console.error("Stamp increment error:", stampError?.message);
    return NextResponse.json({ error: "Failed to update stamp", detail: stampError?.message ?? "No result returned" }, { status: 500 });
  }

  const stamp = stampResult[0];
  let currentStamps = stamp.new_current_stamps;
  let completedCount = stamp.new_completed_count;
  let midRewardClaimed = stamp.new_mid_reward_claimed;
  let rewardType: "none" | "mid" | "full" = "none";
  let rewardMessage = "";

  // L06修正: full判定を先にチェックし、mid+fullが同時発火しないようにする
  if (currentStamps >= card.total_stamps) {
    // Full reward
    rewardType = "full";

    // スタンプIDを取得してリセット
    const { data: stampRow } = await supabase
      .from("customer_stamps")
      .select("id")
      .eq("stamp_card_id", card.id)
      .eq("customer_id", customer.id)
      .single();

    if (stampRow) {
      await supabase.rpc("reset_stamp_on_complete", { p_stamp_id: stampRow.id });
    }

    currentStamps = 0;
    completedCount += 1;
    midRewardClaimed = false;

    // 010: full_reward_group_id 優先、なければ reward_coupon_template_id
    if (card.full_reward_group_id) {
      await issueCouponGroup(supabase, card.full_reward_group_id, customer.id, resolvedShopId, organizationId);
    } else if (card.reward_coupon_template_id) {
      await issueCoupon(supabase, card.reward_coupon_template_id, customer.id, resolvedShopId, organizationId);
    }
    rewardMessage = `スタンプカードコンプリート! 特典クーポンをLINEにお送りしました!`;

    if (shop.line_channel_access_token) {
      await sendPushMessage(shop.line_channel_access_token, line_user_id, [
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
    // Mid reward
    rewardType = "mid";

    const { data: stampRow } = await supabase
      .from("customer_stamps")
      .select("id")
      .eq("stamp_card_id", card.id)
      .eq("customer_id", customer.id)
      .single();

    if (stampRow) {
      await supabase.rpc("claim_mid_reward", { p_stamp_id: stampRow.id });
    }

    midRewardClaimed = true;

    // 010: mid_reward_group_id 優先、なければ mid_reward_coupon_template_id
    if (card.mid_reward_group_id) {
      await issueCouponGroup(supabase, card.mid_reward_group_id, customer.id, resolvedShopId, organizationId);
    } else if (card.mid_reward_coupon_template_id) {
      await issueCoupon(supabase, card.mid_reward_coupon_template_id, customer.id, resolvedShopId, organizationId);
    }
    rewardMessage = `スタンプ${card.mid_stamps}個達成! 特典クーポンをLINEにお送りしました!`;

    if (shop.line_channel_access_token) {
      await sendPushMessage(shop.line_channel_access_token, line_user_id, [
        {
          type: "text",
          text: `スタンプ${card.mid_stamps}個達成おめでとうございます!\n特典クーポンをお送りしました。次回ご来店時にスタッフにご提示ください!`,
        },
      ]);
    }
  }

  // Record visit (どの店舗で押したかは shop_id で追跡)
  const { error: visitInsertError } = await supabase.from("visit_logs").insert({
    customer_id: customer.id,
    shop_id: resolvedShopId,
    organization_id: organizationId,
  });

  if (visitInsertError) {
    console.error("Visit log insert error:", visitInsertError.message);
  }

  // L02/L07修正: アトミック更新 + shop_id付きのカウント
  const { data: newVisitCount } = await supabase.rpc("atomic_increment_visit_count", {
    p_customer_id: customer.id,
  });

  return NextResponse.json({
    success: true,
    shop_name: shop.name,
    shop_code: shop.code,
    current_stamps: currentStamps,
    total_stamps: card.total_stamps,
    mid_stamps: card.mid_stamps,
    completed_count: completedCount,
    reward_type: rewardType,
    reward_message: rewardMessage,
    visit_count: newVisitCount ?? 0,
  });
}

async function issueCoupon(
  supabase: ReturnType<typeof createServiceClient>,
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

// 010: 排他的クーポングループの一括発行
async function issueCouponGroup(
  supabase: ReturnType<typeof createServiceClient>,
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

// S04: LIFFトークン検証
async function verifyLiffToken(
  idToken: string,
  channelId: string,
  expectedUserId: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: channelId,
      }),
    });

    if (!res.ok) return false;

    const data = await res.json() as { sub?: string };
    return data.sub === expectedUserId;
  } catch {
    return false;
  }
}
