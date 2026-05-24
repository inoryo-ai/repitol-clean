-- =====================================================
-- 011: 組織（organization）単位でのデータ統合
-- 同じオーナーが複数店舗を持つ場合に、スタンプ・顧客・クーポンを共有可能にする。
--
-- 変更概要:
-- 1. organizations テーブル新設（ブランド/会社単位）
-- 2. shops.organization_id 追加（必須）
-- 3. customers.organization_id 追加 + UNIQUE を (organization_id, line_user_id) に変更
-- 4. stamp_cards.organization_id 追加（shop_id は保持するが org 優先）
-- 5. coupon_templates / coupons_issued / coupon_group_templates に organization_id 追加
-- 6. Demo Restaurant 2店舗（shop_a・shop_b）を 1組織に統合。スタンプ・クーポンを合算化
-- 7. RLS を organization 単位に置き換え（get_user_organization_id）
--
-- 方針:
-- * 既存 shop_id は残す（完全移行まで後方互換を担保）
-- * Demo Restaurantの既存データを Shop A(11111111-*) 側に寄せて統合
-- =====================================================

-- ---------- 1. organizations テーブル ----------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Demo Restaurantの組織を作成
INSERT INTO public.organizations (id, name)
VALUES ('33333333-3333-3333-3333-333333333333'::uuid, 'Demo Restaurant')
ON CONFLICT (id) DO NOTHING;

-- ---------- 2. shops.organization_id ----------
ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.shops
SET organization_id = '33333333-3333-3333-3333-333333333333'::uuid
WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

CREATE INDEX IF NOT EXISTS idx_shops_org ON public.shops(organization_id);

-- ---------- 3. customers.organization_id ----------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.customers c
SET organization_id = s.organization_id
FROM public.shops s
WHERE c.shop_id = s.id
  AND c.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_customers_org ON public.customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_org_line ON public.customers(organization_id, line_user_id);

-- 重複顧客の統合: 同一 (organization_id, line_user_id) で最古レコードに寄せる
DO $$
DECLARE
  dup RECORD;
  keeper_id UUID;
BEGIN
  FOR dup IN
    SELECT organization_id, line_user_id, array_agg(id ORDER BY first_visit_at ASC) AS ids, count(*) AS cnt
    FROM public.customers
    WHERE organization_id IS NOT NULL
    GROUP BY organization_id, line_user_id
    HAVING count(*) > 1
  LOOP
    keeper_id := dup.ids[1];
    -- 関連レコードを keeper_id に付け替え
    UPDATE public.visit_logs SET customer_id = keeper_id
      WHERE customer_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    UPDATE public.coupons_issued SET customer_id = keeper_id
      WHERE customer_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    UPDATE public.customer_stamps SET customer_id = keeper_id
      WHERE customer_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    UPDATE public.reservations SET customer_id = keeper_id
      WHERE customer_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    UPDATE public.message_logs SET customer_id = keeper_id
      WHERE customer_id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
    -- keeper に visit_count 合算
    UPDATE public.customers SET
      visit_count = (
        SELECT COALESCE(SUM(visit_count), 0) FROM public.customers
        WHERE id = ANY(dup.ids)
      ),
      last_visit_at = (
        SELECT MAX(last_visit_at) FROM public.customers
        WHERE id = ANY(dup.ids)
      )
    WHERE id = keeper_id;
    -- 重複レコード削除
    DELETE FROM public.customers
      WHERE id = ANY(dup.ids[2:array_length(dup.ids, 1)]);
  END LOOP;
END $$;

-- UNIQUE 制約を組織単位に張り替え
ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_shop_id_line_user_id_key;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_org_line_user_unique UNIQUE (organization_id, line_user_id);

-- ---------- 4. stamp_cards.organization_id ----------
ALTER TABLE public.stamp_cards
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Demo Restaurant: Shop Aのスタンプカードを組織共通カードに昇格
UPDATE public.stamp_cards
SET organization_id = '33333333-3333-3333-3333-333333333333'::uuid
WHERE id = 'bbbb0001-0000-0000-0000-000000000001';

-- Shop Bのカード（bbbb0001-...-0002）の customer_stamps を Shop Aカードに移動
-- customer_stamps.(stamp_card_id, customer_id) が UNIQUE なので競合時は合算
DO $$
DECLARE
  orphan RECORD;
BEGIN
  FOR orphan IN
    SELECT cs.id, cs.customer_id, cs.current_stamps, cs.completed_count, cs.mid_reward_claimed
    FROM public.customer_stamps cs
    WHERE cs.stamp_card_id = 'bbbb0001-0000-0000-0000-000000000002'
  LOOP
    -- Shop Aカード側に同 customer_id が既にあるか
    IF EXISTS (
      SELECT 1 FROM public.customer_stamps
      WHERE stamp_card_id = 'bbbb0001-0000-0000-0000-000000000001'
        AND customer_id = orphan.customer_id
    ) THEN
      -- 合算（mid_reward_claimed は OR で統合。片方で受領済みなら受領扱いにして二重発行を防止）
      UPDATE public.customer_stamps SET
        current_stamps = LEAST(current_stamps + orphan.current_stamps, 10),
        completed_count = completed_count + orphan.completed_count,
        mid_reward_claimed = mid_reward_claimed OR orphan.mid_reward_claimed
      WHERE stamp_card_id = 'bbbb0001-0000-0000-0000-000000000001'
        AND customer_id = orphan.customer_id;
      DELETE FROM public.customer_stamps WHERE id = orphan.id;
    ELSE
      -- 付け替え
      UPDATE public.customer_stamps
      SET stamp_card_id = 'bbbb0001-0000-0000-0000-000000000001'
      WHERE id = orphan.id;
    END IF;
  END LOOP;
END $$;

-- Shop Bのスタンプカード定義は非アクティブ化（削除はせず履歴は残す）
UPDATE public.stamp_cards
SET is_active = false,
    organization_id = '33333333-3333-3333-3333-333333333333'::uuid
WHERE id = 'bbbb0001-0000-0000-0000-000000000002';

CREATE INDEX IF NOT EXISTS idx_stamp_cards_org ON public.stamp_cards(organization_id)
  WHERE is_active = true;

-- ---------- 5. coupon_templates.organization_id ----------
ALTER TABLE public.coupon_templates
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.coupon_templates t
SET organization_id = s.organization_id
FROM public.shops s
WHERE t.shop_id = s.id
  AND t.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_coupon_tpl_org ON public.coupon_templates(organization_id);

-- ---------- 6. coupons_issued.organization_id ----------
ALTER TABLE public.coupons_issued
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.coupons_issued ci
SET organization_id = s.organization_id
FROM public.shops s
WHERE ci.shop_id = s.id
  AND ci.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_issued_org ON public.coupons_issued(organization_id, status);

-- ---------- 7. visit_logs / reservations / message_logs に org_id 追加（分析用） ----------
ALTER TABLE public.visit_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.visit_logs v
SET organization_id = s.organization_id
FROM public.shops s WHERE v.shop_id = s.id AND v.organization_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_visits_org_date ON public.visit_logs(organization_id, visited_at DESC);

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.reservations r
SET organization_id = s.organization_id
FROM public.shops s WHERE r.shop_id = s.id AND r.organization_id IS NULL;

ALTER TABLE public.message_logs
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
UPDATE public.message_logs m
SET organization_id = s.organization_id
FROM public.shops s WHERE m.shop_id = s.id AND m.organization_id IS NULL;

-- ---------- 8. RLS ヘルパー関数 ----------
CREATE OR REPLACE FUNCTION public.get_user_organization_id()
RETURNS UUID AS $$
  SELECT s.organization_id
  FROM public.profiles p
  JOIN public.shops s ON s.id = p.shop_id
  WHERE p.id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ---------- 9. RLS ポリシー置き換え（organization 単位） ----------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_own" ON public.organizations FOR SELECT
  USING (id = public.get_user_organization_id());

-- shops: 同じ組織の全店舗が見える
DROP POLICY IF EXISTS "shops_select_own" ON public.shops;
DROP POLICY IF EXISTS "shops_update_own" ON public.shops;
CREATE POLICY "shops_select_org" ON public.shops FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "shops_update_org" ON public.shops FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

-- customers: 組織単位
DROP POLICY IF EXISTS "customers_select" ON public.customers;
DROP POLICY IF EXISTS "customers_insert" ON public.customers;
DROP POLICY IF EXISTS "customers_update" ON public.customers;
DROP POLICY IF EXISTS "customers_delete" ON public.customers;
CREATE POLICY "customers_select_org" ON public.customers FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "customers_insert_org" ON public.customers FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "customers_update_org" ON public.customers FOR UPDATE
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "customers_delete_org" ON public.customers FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- visit_logs
DROP POLICY IF EXISTS "visits_select" ON public.visit_logs;
DROP POLICY IF EXISTS "visits_insert" ON public.visit_logs;
CREATE POLICY "visits_select_org" ON public.visit_logs FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "visits_insert_org" ON public.visit_logs FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

-- coupon_templates
DROP POLICY IF EXISTS "coupon_tpl_select" ON public.coupon_templates;
DROP POLICY IF EXISTS "coupon_tpl_insert" ON public.coupon_templates;
DROP POLICY IF EXISTS "coupon_tpl_update" ON public.coupon_templates;
DROP POLICY IF EXISTS "coupon_tpl_delete" ON public.coupon_templates;
CREATE POLICY "coupon_tpl_select_org" ON public.coupon_templates FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "coupon_tpl_insert_org" ON public.coupon_templates FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "coupon_tpl_update_org" ON public.coupon_templates FOR UPDATE
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "coupon_tpl_delete_org" ON public.coupon_templates FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- coupons_issued
DROP POLICY IF EXISTS "coupons_issued_select" ON public.coupons_issued;
DROP POLICY IF EXISTS "coupons_issued_insert" ON public.coupons_issued;
DROP POLICY IF EXISTS "coupons_issued_update" ON public.coupons_issued;
CREATE POLICY "coupons_issued_select_org" ON public.coupons_issued FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "coupons_issued_insert_org" ON public.coupons_issued FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "coupons_issued_update_org" ON public.coupons_issued FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

-- stamp_cards
DROP POLICY IF EXISTS "stamps_select" ON public.stamp_cards;
DROP POLICY IF EXISTS "stamps_insert" ON public.stamp_cards;
DROP POLICY IF EXISTS "stamps_update" ON public.stamp_cards;
CREATE POLICY "stamps_select_org" ON public.stamp_cards FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "stamps_insert_org" ON public.stamp_cards FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "stamps_update_org" ON public.stamp_cards FOR UPDATE
  USING (organization_id = public.get_user_organization_id());

-- customer_stamps: 組織内の stamp_card 経由
DROP POLICY IF EXISTS "cstamps_select" ON public.customer_stamps;
DROP POLICY IF EXISTS "cstamps_insert" ON public.customer_stamps;
DROP POLICY IF EXISTS "cstamps_update" ON public.customer_stamps;
CREATE POLICY "cstamps_select_org" ON public.customer_stamps FOR SELECT
  USING (stamp_card_id IN (
    SELECT id FROM public.stamp_cards
    WHERE organization_id = public.get_user_organization_id()
  ));
CREATE POLICY "cstamps_insert_org" ON public.customer_stamps FOR INSERT
  WITH CHECK (stamp_card_id IN (
    SELECT id FROM public.stamp_cards
    WHERE organization_id = public.get_user_organization_id()
  ));
CREATE POLICY "cstamps_update_org" ON public.customer_stamps FOR UPDATE
  USING (stamp_card_id IN (
    SELECT id FROM public.stamp_cards
    WHERE organization_id = public.get_user_organization_id()
  ));

-- reservations
DROP POLICY IF EXISTS "reservations_select" ON public.reservations;
DROP POLICY IF EXISTS "reservations_insert" ON public.reservations;
DROP POLICY IF EXISTS "reservations_update" ON public.reservations;
DROP POLICY IF EXISTS "reservations_delete" ON public.reservations;
CREATE POLICY "reservations_select_org" ON public.reservations FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "reservations_insert_org" ON public.reservations FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "reservations_update_org" ON public.reservations FOR UPDATE
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "reservations_delete_org" ON public.reservations FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- message_logs
DROP POLICY IF EXISTS "messages_select" ON public.message_logs;
CREATE POLICY "messages_select_org" ON public.message_logs FOR SELECT
  USING (organization_id = public.get_user_organization_id());

-- auto_triggers はそのまま shop 単位（友だち追加/初回訪問は店舗単位イベント）

-- ---------- 10. 検証 ----------
SELECT '=== organizations ===' AS info;
SELECT id, name FROM public.organizations;

SELECT '=== shops (org 紐付け確認) ===' AS info;
SELECT id, name, organization_id FROM public.shops
WHERE organization_id = '33333333-3333-3333-3333-333333333333'::uuid;

SELECT '=== stamp_cards (Demo Restaurant) ===' AS info;
SELECT id, name, shop_id, organization_id, is_active
FROM public.stamp_cards
WHERE organization_id = '33333333-3333-3333-3333-333333333333'::uuid;

SELECT '=== customers 重複チェック（0件であるべき）===' AS info;
SELECT organization_id, line_user_id, count(*) AS dup
FROM public.customers
WHERE organization_id = '33333333-3333-3333-3333-333333333333'::uuid
GROUP BY organization_id, line_user_id
HAVING count(*) > 1;

SELECT '=== customer_stamps 全件が active card に紐付いてるか ===' AS info;
SELECT cs.stamp_card_id, sc.is_active, count(*) AS cnt
FROM public.customer_stamps cs
JOIN public.stamp_cards sc ON sc.id = cs.stamp_card_id
WHERE sc.organization_id = '33333333-3333-3333-3333-333333333333'::uuid
GROUP BY cs.stamp_card_id, sc.is_active;
