import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";

function createServiceClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );
}

/**
 * 管理画面: 顧客のスタンプ取得履歴
 * GET /api/admin/customers/[id]/stamp-history?limit=20&offset=0
 *
 * 認証: 通常のSupabase Authセッションでログイン済みであること
 *       かつ、対象 customer の organization_id == ログインユーザーの organization_id
 *
 * レスポンス: { events: [{ id, stamped_at, shop_id, shop_code, shop_name, cycle }], total }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: customerId } = await params;

  // 認証チェック（ログインユーザーの organization に属する顧客のみ）
  const authedClient = await createClient();
  const { data: { user } } = await authedClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrganizationId();
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // 対象顧客が同じ組織か検証
  const { data: customer } = await authedClient
    .from("customers")
    .select("id, organization_id")
    .eq("id", customerId)
    .single();
  if (!customer || customer.organization_id !== orgId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "20");
  const offsetParam = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Math.min(Math.max(1, Number.isFinite(limitParam) ? limitParam : 20), 200);
  const offset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0);

  // service role でイベント取得（RLS は通すが、上で組織検証済みなので安全）
  const svc = createServiceClient();

  // 顧客の customer_stamps を経由して events を取得
  const { data: stamps } = await svc
    .from("customer_stamps")
    .select("id")
    .eq("customer_id", customerId);

  const stampIds = (stamps ?? []).map((s) => s.id);
  if (stampIds.length === 0) {
    return NextResponse.json({ events: [], total: 0 });
  }

  const { count: total } = await svc
    .from("customer_stamp_events")
    .select("id", { count: "exact", head: true })
    .in("customer_stamp_id", stampIds)
    .eq("organization_id", orgId);

  const { data: rawEvents, error } = await svc
    .from("customer_stamp_events")
    .select("id, stamped_at, shop_id, cycle, shops:shop_id(code, name)")
    .in("customer_stamp_id", stampIds)
    .eq("organization_id", orgId)
    .order("stamped_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events = (rawEvents ?? []).map((e) => {
    const shop = Array.isArray(e.shops) ? e.shops[0] : e.shops;
    const s = shop as { code?: string | null; name?: string | null } | null;
    return {
      id: e.id as string,
      stamped_at: e.stamped_at as string,
      shop_id: e.shop_id as string | null,
      shop_code: s?.code ?? null,
      shop_name: s?.name ?? null,
      cycle: e.cycle as number,
    };
  });

  return NextResponse.json({ events, total: total ?? 0 });
}
