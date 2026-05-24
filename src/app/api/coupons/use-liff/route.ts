import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

/**
 * LIFF経由でクーポンを使用する
 * POST /api/coupons/use-liff
 * Body: { coupon_id, line_user_id, liff_token }
 */
export async function POST(request: NextRequest) {
  let body: { coupon_id?: string; line_user_id?: string; liff_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { coupon_id, line_user_id, liff_token } = body;

  if (!coupon_id || !line_user_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // LIFF トークン検証
  const liffChannelId = process.env.LIFF_CHANNEL_ID;
  if (liffChannelId && liff_token) {
    const verified = await verifyLiffToken(liff_token, liffChannelId, line_user_id);
    if (!verified) {
      return NextResponse.json({ error: "Invalid LIFF token" }, { status: 401 });
    }
  }

  const supabase = createServiceClient();

  // クーポンを取得
  const { data: coupon, error: fetchErr } = await supabase
    .from("coupons_issued")
    .select("*, coupon_templates!inner(title, description)")
    .eq("id", coupon_id)
    .single();

  if (fetchErr || !coupon) {
    return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  }

  // 所有者確認
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", coupon.customer_id)
    .eq("line_user_id", line_user_id)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Not your coupon" }, { status: 403 });
  }

  if (coupon.status === "used") {
    return NextResponse.json({ error: "already_used", error_ja: "このクーポンは使用済みです" }, { status: 400 });
  }

  if (new Date(coupon.expires_at) < new Date()) {
    return NextResponse.json({ error: "expired", error_ja: "このクーポンは期限切れです" }, { status: 400 });
  }

  // 使用済みに更新
  const { error: updateErr } = await supabase
    .from("coupons_issued")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("id", coupon_id);

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
      .neq("id", coupon_id);
  }

  return NextResponse.json({ success: true });
}

async function verifyLiffToken(
  idToken: string,
  channelId: string,
  expectedUserId: string
): Promise<boolean> {
  try {
    const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!res.ok) return false;
    const data = await res.json() as { sub?: string };
    return data.sub === expectedUserId;
  } catch {
    return false;
  }
}
