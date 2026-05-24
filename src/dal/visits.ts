import { createClient } from "@/lib/supabase/server";
import type { VisitLog } from "@/lib/types/database";

interface Scope { organizationId: string; shopId: string | null }

function applyScope<T>(query: T, scope: Scope): T {
  // @ts-expect-error - query builder chain
  return scope.shopId ? query.eq("shop_id", scope.shopId) : query.eq("organization_id", scope.organizationId);
}

export async function getVisitCountThisMonth(scope: Scope): Promise<number> {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const supabase = await createClient();
  let query = supabase
    .from("visit_logs")
    .select("*", { count: "exact", head: true })
    .gte("visited_at", firstOfMonth);
  query = applyScope(query, scope);
  const { count, error } = await query;

  if (error) {
    console.error("getVisitCountThisMonth error:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getRecentVisits(scope: Scope, limit = 10): Promise<VisitLog[]> {
  const supabase = await createClient();
  let query = supabase.from("visit_logs").select("*");
  query = applyScope(query, scope);
  const { data, error } = await query
    .order("visited_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("getRecentVisits error:", error.message);
    return [];
  }
  return data ?? [];
}
