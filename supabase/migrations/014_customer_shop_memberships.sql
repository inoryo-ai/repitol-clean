-- =====================================================
-- 014: 顧客 × 店舗LINE OA の友だち関係テーブル
--
-- Migration 011 で顧客を組織単位に統合した結果、
-- 「どの店舗の LINE OA と友だち関係か」の情報が失われた。
-- このテーブルで (customer, shop) の友だち関係を明示的に追跡する。
--
-- 用途:
-- - webhook follow イベント: INSERT or is_blocked=false に更新
-- - webhook unfollow イベント: is_blocked=true
-- - 店舗別「友だち」一覧: この表を参照
-- =====================================================

CREATE TABLE IF NOT EXISTS public.customer_shop_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(customer_id, shop_id)
);

CREATE INDEX IF NOT EXISTS idx_csm_customer ON public.customer_shop_memberships(customer_id);
CREATE INDEX IF NOT EXISTS idx_csm_shop_active ON public.customer_shop_memberships(shop_id) WHERE is_blocked = false;
CREATE INDEX IF NOT EXISTS idx_csm_org ON public.customer_shop_memberships(organization_id);

CREATE TRIGGER csm_updated_at
  BEFORE UPDATE ON public.customer_shop_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.customer_shop_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csm_select_org" ON public.customer_shop_memberships FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "csm_insert_org" ON public.customer_shop_memberships FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

CREATE POLICY "csm_update_org" ON public.customer_shop_memberships FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

-- 既存顧客の customers.shop_id に基づく暫定 membership を作成（来店実績がない人もここで拾う）
INSERT INTO public.customer_shop_memberships (customer_id, shop_id, organization_id, followed_at, is_blocked)
SELECT c.id, c.shop_id, c.organization_id, c.first_visit_at, c.is_blocked
FROM public.customers c
WHERE c.shop_id IS NOT NULL AND c.organization_id IS NOT NULL
ON CONFLICT (customer_id, shop_id) DO NOTHING;

-- visit_logs 実績から補完（shop_id が customers と違う visit があれば そこでも friend 扱い）
INSERT INTO public.customer_shop_memberships (customer_id, shop_id, organization_id, followed_at)
SELECT DISTINCT v.customer_id, v.shop_id, v.organization_id, min(v.visited_at) OVER (PARTITION BY v.customer_id, v.shop_id)
FROM public.visit_logs v
WHERE v.organization_id IS NOT NULL
ON CONFLICT (customer_id, shop_id) DO NOTHING;

-- 検証
SELECT '=== memberships 件数 ===' AS info;
SELECT shop_id, count(*) AS total, count(*) FILTER (WHERE is_blocked = false) AS active
FROM public.customer_shop_memberships
GROUP BY shop_id;
