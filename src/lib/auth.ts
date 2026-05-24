/**
 * 共通認証・shopId/organizationId取得ユーティリティ
 * A06: getShopId()のコピペ問題を解決
 * 011: organization_id 対応
 */
import { createClient } from "@/lib/supabase/server";

export async function getShopId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  return profile?.shop_id ?? null;
}

export async function getOrganizationId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  if (!profile?.shop_id) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select("organization_id")
    .eq("id", profile.shop_id)
    .single();

  return shop?.organization_id ?? null;
}

export async function getOrganizationShops(): Promise<Array<{ id: string; name: string; code: string | null }>> {
  const supabase = await createClient();
  const organizationId = await getOrganizationId();
  if (!organizationId) return [];

  const { data } = await supabase
    .from("shops")
    .select("id, name, code")
    .eq("organization_id", organizationId)
    .order("name");

  return data ?? [];
}

export async function getShopWithLine() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .single();

  if (!profile?.shop_id) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select("id, line_channel_access_token, organization_id")
    .eq("id", profile.shop_id)
    .single();

  return shop;
}

/**
 * スコープ解決ヘルパー: URL の shop クエリから絞り込み条件を返す
 * - shop=all or undefined → 組織全体
 * - shop=<uuid> → その店舗のみ
 */
export interface DashboardScope {
  organizationId: string;
  shopId: string | null; // null = 全店舗
  shops: Array<{ id: string; name: string; code: string | null }>;
}

export async function resolveScope(shopParam?: string | null): Promise<DashboardScope | null> {
  const organizationId = await getOrganizationId();
  if (!organizationId) return null;
  const shops = await getOrganizationShops();

  let shopId: string | null = null;
  if (shopParam && shopParam !== "all") {
    // 指定された shop_id が組織内に属するか検証
    if (shops.some(s => s.id === shopParam)) {
      shopId = shopParam;
    }
  }

  return { organizationId, shopId, shops };
}
