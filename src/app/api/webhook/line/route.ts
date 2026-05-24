import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import crypto from "crypto";
import { sendPushMessage, sendReplyMessage } from "@/lib/line";
import type { SupabaseClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

// LINE05: バッファ長不一致でもクラッシュしないように修正
function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const hmac = crypto.createHmac("SHA256", secret);
    hmac.update(body);
    const digest = hmac.digest();
    const sigBuf = Buffer.from(signature, "base64");
    if (digest.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(digest, sigBuf);
  } catch {
    return false;
  }
}

async function getLineProfile(accessToken: string, userId: string) {
  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ displayName: string; pictureUrl?: string }>;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const shopId = request.nextUrl.searchParams.get("shop_id");
  if (!shopId) {
    return NextResponse.json({ error: "shop_id required" }, { status: 400 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-line-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Get shop's LINE credentials (service role - not exposed to browser)
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("line_channel_secret, line_channel_access_token, name, organization_id")
    .eq("id", shopId)
    .single();

  if (shopError || !shop?.line_channel_secret) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const organizationId: string | null = shop.organization_id ?? null;

  // Verify signature
  if (!verifySignature(body, signature, shop.line_channel_secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // E01: JSON.parseにtry-catch追加
  let parsed: { events?: unknown[] };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const events = parsed.events ?? [];

  for (const event of events as Array<{
    type: string;
    source?: { userId?: string };
    timestamp?: number;
    replyToken?: string;
    message?: { type?: string; text?: string };
  }>) {
    const lineUserId = event.source?.userId;
    if (!lineUserId) continue;

    if (event.type === "follow") {
      const profile = shop.line_channel_access_token
        ? await getLineProfile(shop.line_channel_access_token, lineUserId)
        : null;

      // 011: 組織単位で既存顧客を確認
      let existingQuery = supabase
        .from("customers")
        .select("id, visit_count, display_name, picture_url")
        .eq("line_user_id", lineUserId);
      existingQuery = organizationId
        ? existingQuery.eq("organization_id", organizationId)
        : existingQuery.eq("shop_id", shopId);
      const { data: existing } = await existingQuery.maybeSingle();

      let customer: { id: string; visit_count: number } | null = null;
      let upsertError: { message: string } | null = null;

      if (existing) {
        // 再フォロー: プロフィール更新 + ブロック解除のみ（first_visit_at保持）
        const { error } = await supabase
          .from("customers")
          .update({
            display_name: profile?.displayName ?? existing.display_name,
            picture_url: profile?.pictureUrl ?? existing.picture_url,
            is_blocked: false,
          })
          .eq("id", existing.id);
        customer = existing;
        upsertError = error;
      } else {
        // 新規登録（organization_id を必ずセット）
        const { data, error } = await supabase
          .from("customers")
          .insert({
            shop_id: shopId,
            organization_id: organizationId,
            line_user_id: lineUserId,
            display_name: profile?.displayName ?? null,
            picture_url: profile?.pictureUrl ?? null,
            is_blocked: false,
            first_visit_at: new Date().toISOString(),
          })
          .select("id, visit_count")
          .single();
        customer = data;
        upsertError = error;
      }

      if (upsertError) {
        console.error("Customer upsert error:", upsertError.message);
        continue;
      }

      // 014: 店舗LINE OA との friend 関係を記録
      if (customer && organizationId) {
        const { error: memErr } = await supabase
          .from("customer_shop_memberships")
          .upsert({
            customer_id: customer.id,
            shop_id: shopId,
            organization_id: organizationId,
            followed_at: new Date().toISOString(),
            is_blocked: false,
          }, { onConflict: "customer_id,shop_id" });
        if (memErr) console.error("membership upsert error:", memErr.message);
      }

      // 友だち追加時: 新規のみ初回クーポン自動発行
      // ウェルカムメッセージはLINE側のあいさつメッセージで送信
      // 再フォロー（existing が存在する場合）はスキップ
      if (shop.line_channel_access_token && !existing) {
        const { data: trigger } = await supabase
          .from("auto_triggers")
          .select("coupon_template_id")
          .eq("shop_id", shopId)
          .eq("trigger_type", "first_visit")
          .eq("is_active", true)
          .single();

        // 初回クーポン発行（テンプレートが設定されている場合）
        if (trigger?.coupon_template_id && customer) {
          await issueWelcomeCoupon(
            supabase, trigger.coupon_template_id,
            customer.id, shopId, organizationId,
            shop.line_channel_access_token, lineUserId
          );
        }
      }
    }

    if (event.type === "unfollow") {
      // 014: 店舗単位の friend 関係をブロック扱いに
      // customers.is_blocked は「全OAから去った」時のみ立てる
      let custQuery = supabase.from("customers").select("id").eq("line_user_id", lineUserId);
      custQuery = organizationId ? custQuery.eq("organization_id", organizationId) : custQuery.eq("shop_id", shopId);
      const { data: c } = await custQuery.maybeSingle();

      if (c) {
        await supabase
          .from("customer_shop_memberships")
          .update({ is_blocked: true, updated_at: new Date().toISOString() })
          .eq("customer_id", c.id)
          .eq("shop_id", shopId);

        // 全 OA から unfollow されている場合のみ customer 側もブロック扱い
        const { count } = await supabase
          .from("customer_shop_memberships")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", c.id)
          .eq("is_blocked", false);
        if ((count ?? 0) === 0) {
          await supabase.from("customers").update({ is_blocked: true }).eq("id", c.id);
        }
      }
    }

    if (event.type === "message" && event.message?.type === "text") {
      const messageText = event.message.text?.trim() ?? "";

      let custQuery = supabase.from("customers").select("id").eq("line_user_id", lineUserId);
      custQuery = organizationId ? custQuery.eq("organization_id", organizationId) : custQuery.eq("shop_id", shopId);
      const { data: customer } = await custQuery.maybeSingle();

      // メッセージログ
      await supabase.from("message_logs").insert({
        shop_id: shopId,
        customer_id: customer?.id ?? null,
        message_type: "text",
        content: messageText,
        sent_at: new Date(event.timestamp ?? Date.now()).toISOString(),
        success: true,
      }).then(({ error }) => { if (error) console.error("Message log error:", error.message); });

      // 「クーポン」テキストに反応（リプライ＝無料）
      if (messageText === "クーポン" && customer && shop.line_channel_access_token && event.replyToken) {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://repitol.vercel.app";
        const couponUrl = `${baseUrl}/coupon?uid=${lineUserId}`;

        // 組織単位で active クーポン数をカウント
        const { count } = await supabase
          .from("coupons_issued")
          .select("*", { count: "exact", head: true })
          .eq("customer_id", customer.id)
          .eq("status", "active")
          .gt("expires_at", new Date().toISOString());

        const couponCount = count ?? 0;

        await sendReplyMessage(shop.line_channel_access_token, event.replyToken, [
          {
            type: "text",
            text: couponCount > 0
              ? `利用可能なクーポンが${couponCount}枚あります！\n\n▼ クーポンを確認・使用する\n${couponUrl}`
              : `現在利用可能なクーポンはありません。\n\nスタンプを貯めて特典をゲットしましょう！`,
          },
        ]);
      }

      // 「メニュー」テキストに反応（リプライ＝無料、Flex Carousel で最大10アイテム）
      if (messageText === "メニュー" && shop.line_channel_access_token && event.replyToken) {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://repitol.vercel.app";
        const { data: dbItems } = await supabase
          .from("menu_items")
          .select("title, subtitle, image_url")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("sort_order")
          .limit(10);
        const menuItems = (dbItems ?? []).map(it => ({
          title: it.title as string,
          subtitle: (it.subtitle as string) ?? "",
          image_url: (it.image_url as string) ?? "",
        }));
        if (menuItems.length === 0) {
          // 管理画面で未登録の場合は何もしない（またはフォールバック文言）
          await sendReplyMessage(shop.line_channel_access_token, event.replyToken, [
            { type: "text", text: "メニュー準備中です。少々お待ちください。" },
          ]);
          continue;
        }

        const carousel = {
          type: "carousel",
          contents: menuItems.map(item => ({
            type: "bubble",
            hero: item.image_url ? {
              type: "image",
              url: item.image_url.startsWith("http") ? item.image_url : `${baseUrl}${item.image_url}`,
              size: "full",
              aspectRatio: "1:1",
              aspectMode: "cover",
            } : undefined,
            body: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: item.title,
                  weight: "bold",
                  size: "lg",
                  wrap: true,
                },
                {
                  type: "text",
                  text: item.subtitle,
                  size: "sm",
                  color: "#888888",
                  wrap: true,
                },
              ],
            },
          })),
        };

        await sendReplyMessage(shop.line_channel_access_token, event.replyToken, [
          {
            type: "flex",
            altText: "Demo Restaurantの人気メニュー",
            contents: carousel,
          },
        ]);
      }

      // 「スタンプ」テキストに反応（リプライ＝無料）
      if (messageText === "スタンプ" && customer && shop.line_channel_access_token && event.replyToken) {
        const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://repitol.vercel.app";
        const stampUrl = `${baseUrl}/stamp?uid=${lineUserId}`;

        // 組織共通のアクティブカードを取得
        let cardQuery = supabase
          .from("stamp_cards")
          .select("id, total_stamps, mid_stamps")
          .eq("is_active", true);
        cardQuery = organizationId ? cardQuery.eq("organization_id", organizationId) : cardQuery.eq("shop_id", shopId);
        const { data: card } = await cardQuery.maybeSingle();

        let stampMsg = "スタンプカード情報を確認できます。";
        if (card) {
          const { data: stamps } = await supabase
            .from("customer_stamps")
            .select("current_stamps, completed_count")
            .eq("stamp_card_id", card.id)
            .eq("customer_id", customer.id)
            .single();

          const current = stamps?.current_stamps ?? 0;
          stampMsg = `現在のスタンプ: ${current}/${card.total_stamps}個`;
          if (card.mid_stamps && current < card.mid_stamps) {
            stampMsg += `\nあと${card.mid_stamps - current}個で中間特典！`;
          }
        }

        await sendReplyMessage(shop.line_channel_access_token, event.replyToken, [
          {
            type: "text",
            text: `${stampMsg}\n\n▼ スタンプカードを確認\n${stampUrl}`,
          },
        ]);
      }
    }
  }

  return NextResponse.json({ success: true });
}

async function issueWelcomeCoupon(
  supabase: SupabaseClient,
  templateId: string,
  customerId: string,
  shopId: string,
  organizationId: string | null,
  accessToken: string,
  lineUserId: string
) {
  // 二重発行チェック（同じ顧客に同じテンプレートのクーポンが既にある場合はスキップ）
  // 組織単位で、customer_id + template_id で判定（他店舗経由の重複も防ぐ）
  const { count } = await supabase
    .from("coupons_issued")
    .select("*", { count: "exact", head: true })
    .eq("template_id", templateId)
    .eq("customer_id", customerId);

  if ((count ?? 0) > 0) return;

  const { data: template } = await supabase
    .from("coupon_templates")
    .select("title, valid_days")
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
  });

  if (error) {
    console.error("Welcome coupon issuance error:", error.message);
    return;
  }

  // クーポン発行通知をLINEで送信
  const couponTitle = template?.title ?? "初回特典クーポン";
  await sendPushMessage(accessToken, lineUserId, [
    {
      type: "text",
      text: `初回特典クーポンをプレゼント!\n\n【${couponTitle}】\n有効期限: ${validDays}日間\n\nご来店時にスタッフにこの画面をご提示ください。`,
    },
  ]);
}
