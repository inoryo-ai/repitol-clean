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
 * カスタマー向けスタンプ情報取得（組織単位）
 * GET /api/stamps/info?line_user_id=xxx
 *  互換: GET /api/stamps/info?shop_id=xxx&line_user_id=xxx
 */
export async function GET(request: NextRequest) {
  const shopId = request.nextUrl.searchParams.get("shop_id");
  const lineUserId = request.nextUrl.searchParams.get("line_user_id");

  if (!lineUserId) {
    return NextResponse.json({ error: "Missing line_user_id" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // 組織を特定（shop_id 指定があればそこから、なければ customer から）
  let organizationId: string | null = null;

  if (shopId) {
    const { data: shop } = await supabase
      .from("shops")
      .select("organization_id")
      .eq("id", shopId)
      .single();
    organizationId = shop?.organization_id ?? null;
  }

  if (!organizationId) {
    const { data: cust } = await supabase
      .from("customers")
      .select("organization_id")
      .eq("line_user_id", lineUserId)
      .limit(1)
      .maybeSingle();
    organizationId = cust?.organization_id ?? null;
  }

  if (!organizationId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // 組織名
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .single();

  // 組織の顧客
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("line_user_id", lineUserId)
    .single();

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // 組織のアクティブスタンプカード
  const { data: card } = await supabase
    .from("stamp_cards")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .single();

  if (!card) {
    return NextResponse.json({ error: "No active stamp card" }, { status: 404 });
  }

  // 顧客のスタンプ進捗
  const { data: stamp } = await supabase
    .from("customer_stamps")
    .select("id, current_stamps, completed_count")
    .eq("stamp_card_id", card.id)
    .eq("customer_id", customer.id)
    .maybeSingle();

  // 017: 現在の周のスタンプイベント（押した店舗）を取得
  // cycle = stamp.completed_count が「現在の周」
  type StampEvent = {
    shop_id: string | null;
    shop_code: string | null;
    stamped_at: string;
  };
  let events: StampEvent[] = [];
  if (stamp?.id && (stamp.current_stamps ?? 0) > 0) {
    const { data: rawEvents } = await supabase
      .from("customer_stamp_events")
      .select("shop_id, stamped_at, shops:shop_id(code)")
      .eq("customer_stamp_id", stamp.id)
      .eq("cycle", stamp.completed_count)
      .order("stamped_at", { ascending: true })
      .limit(stamp.current_stamps);

    events = (rawEvents ?? []).map((e) => {
      // supabase-js は relation を配列または単一オブジェクトで返す（FK定義に依存）
      const shop = Array.isArray(e.shops) ? e.shops[0] : e.shops;
      return {
        shop_id: e.shop_id,
        shop_code: (shop as { code?: string | null } | null)?.code ?? null,
        stamped_at: e.stamped_at,
      };
    });
  }

  return NextResponse.json({
    shop_name: org?.name ?? "スタンプカード",
    card_name: card.name,
    total_stamps: card.total_stamps,
    mid_stamps: card.mid_stamps ?? null,
    current_stamps: stamp?.current_stamps ?? 0,
    completed_count: stamp?.completed_count ?? 0,
    events,
  });
}
