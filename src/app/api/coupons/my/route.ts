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
 * お客様のクーポン一覧を取得（組織単位）
 * GET /api/coupons/my?line_user_id=xxx
 *  または GET /api/coupons/my?shop_id=xxx&line_user_id=xxx （後方互換）
 */
export async function GET(request: NextRequest) {
  const shopId = request.nextUrl.searchParams.get("shop_id");
  const lineUserId = request.nextUrl.searchParams.get("line_user_id");

  if (!lineUserId) {
    return NextResponse.json({ error: "Missing line_user_id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 組織単位で顧客を取得
  let customerQuery = supabase
    .from("customers")
    .select("id, organization_id")
    .eq("line_user_id", lineUserId);

  // shop_id が指定されていれば、その店舗が属する組織に絞る（互換）
  if (shopId) {
    const { data: shop } = await supabase
      .from("shops")
      .select("organization_id")
      .eq("id", shopId)
      .single();
    if (shop?.organization_id) {
      customerQuery = customerQuery.eq("organization_id", shop.organization_id);
    }
  }

  const { data: customer } = await customerQuery.maybeSingle();

  if (!customer) {
    return NextResponse.json({ coupons: [] });
  }

  // 期限切れクーポンのステータスを更新
  await supabase
    .from("coupons_issued")
    .update({ status: "expired" })
    .eq("customer_id", customer.id)
    .eq("status", "active")
    .lt("expires_at", new Date().toISOString());

  // クーポン一覧（組織スコープ。customer_id 一致分のみ）
  const { data, error } = await supabase
    .from("coupons_issued")
    .select(
      "id, status, coupon_code, issued_at, expires_at, used_at, exclusive_group_id, coupon_templates!inner(title, description, image_url)"
    )
    .eq("customer_id", customer.id)
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("coupons/my error:", error.message);
    return NextResponse.json({ coupons: [] }, { status: 200 });
  }

  return NextResponse.json({ coupons: data ?? [] });
}
