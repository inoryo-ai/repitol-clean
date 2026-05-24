import { createClient } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/database";

interface Scope { organizationId: string; shopId: string | null }

/**
 * 店舗に属する顧客 ID を返す（customer_shop_memberships ベース）
 * memberships は follow/unfollow で更新されるので「LINE の友だち数」に相当
 */
async function customerIdsForShop(shopId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customer_shop_memberships")
    .select("customer_id")
    .eq("shop_id", shopId)
    .eq("is_blocked", false);
  return Array.from(new Set((data ?? []).map((m) => m.customer_id)));
}

export async function getCustomers(scope: Scope, limit = 50): Promise<Customer[]> {
  const supabase = await createClient();

  if (scope.shopId) {
    const ids = await customerIdsForShop(scope.shopId);
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .in("id", ids)
      .order("last_visit_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) {
      console.error("getCustomers error:", error.message);
      return [];
    }
    return data ?? [];
  }

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", scope.organizationId)
    .order("last_visit_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error("getCustomers error:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getCustomer(id: string, scope: Scope): Promise<Customer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", scope.organizationId)
    .single();

  if (error) {
    console.error("getCustomer error:", error.message);
    return null;
  }
  return data;
}

export async function getCustomerCount(scope: Scope): Promise<number> {
  const supabase = await createClient();

  if (scope.shopId) {
    const ids = await customerIdsForShop(scope.shopId);
    return ids.length;
  }

  const { count, error } = await supabase
    .from("customers")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId);

  if (error) {
    console.error("getCustomerCount error:", error.message);
    return 0;
  }
  return count ?? 0;
}
