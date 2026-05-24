-- =====================================================
-- 010: 排他的クーポングループ機能 + Demo Restaurant 5スタンプ報酬の再構成
-- =====================================================
-- 変更概要:
-- 1. coupons_issued に exclusive_group_id を追加（同グループ内のクーポンは1枚使うと残り失効）
-- 2. coupon_group_templates テーブル追加（1グループ = N templates）
-- 3. stamp_cards に mid_reward_group_id / full_reward_group_id 追加
-- 4. Demo Restaurantの 5スタンプ特典を「選択式1枚」から「4枚発行・1枚使用で残り失効」に変更
-- 5. 既存クーポンテンプレートに画像URLを設定
-- =====================================================

-- ---------- 1. coupons_issued.exclusive_group_id ----------
ALTER TABLE public.coupons_issued
  ADD COLUMN IF NOT EXISTS exclusive_group_id UUID;

CREATE INDEX IF NOT EXISTS idx_coupons_exclusive_group
  ON public.coupons_issued(exclusive_group_id)
  WHERE exclusive_group_id IS NOT NULL;

COMMENT ON COLUMN public.coupons_issued.exclusive_group_id IS
  '排他的クーポングループID。同一グループ内のいずれかが使用されると他は自動失効。';

-- ---------- 2. coupon_group_templates テーブル ----------
CREATE TABLE IF NOT EXISTS public.coupon_group_templates (
  group_id    UUID NOT NULL,
  template_id UUID NOT NULL REFERENCES public.coupon_templates(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, template_id)
);

CREATE INDEX IF NOT EXISTS idx_cgt_group ON public.coupon_group_templates(group_id);

ALTER TABLE public.coupon_group_templates ENABLE ROW LEVEL SECURITY;

-- 全員が読める（発行ロジックが group を参照するため。書き込みはservice roleのみ）
CREATE POLICY "cgt_select_all"
  ON public.coupon_group_templates FOR SELECT
  USING (true);

COMMENT ON TABLE public.coupon_group_templates IS
  'クーポングループ定義。1つのgroup_idに対し複数のtemplate_idを紐付ける。スタンプ報酬で「N枚発行・1枚使用で残り失効」の実現に使用。';

-- ---------- 3. stamp_cards に group 参照列 ----------
ALTER TABLE public.stamp_cards
  ADD COLUMN IF NOT EXISTS mid_reward_group_id  UUID,
  ADD COLUMN IF NOT EXISTS full_reward_group_id UUID;

COMMENT ON COLUMN public.stamp_cards.mid_reward_group_id IS
  '中間特典で発行するクーポングループID（mid_reward_coupon_template_id より優先）';
COMMENT ON COLUMN public.stamp_cards.full_reward_group_id IS
  'コンプリート特典で発行するクーポングループID（reward_coupon_template_id より優先）';

-- ---------- 4. Demo Restaurantの 5スタンプ報酬を4枚構成に変更 ----------

-- 4-1. 新規テンプレート: ソフトドリンク / 煮玉子 / 大盛 (3種、炙りチャーシュー専用版は別作成)
-- Shop A
INSERT INTO public.coupon_templates (id, shop_id, title, description, coupon_type, valid_days, image_url)
VALUES
  ('aaaa0005-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '5スタンプ特典 ソフトドリンクサービス',
   'スタンプ5個達成！ソフトドリンクサービス（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/drink.png'),
  ('aaaa0006-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '5スタンプ特典 炙りチャーシュー1枚無料',
   'スタンプ5個達成！炙りチャーシュー1枚無料（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/aburi_chashu.png'),
  ('aaaa0007-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '5スタンプ特典 煮玉子サービス',
   'スタンプ5個達成！煮玉子1個サービス（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/nitamago.png'),
  ('aaaa0008-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '5スタンプ特典 麺大盛無料',
   'スタンプ5個達成！麺大盛無料（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/oomori.png')
ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      image_url = EXCLUDED.image_url;

-- Shop B
INSERT INTO public.coupon_templates (id, shop_id, title, description, coupon_type, valid_days, image_url)
VALUES
  ('aaaa0005-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '5スタンプ特典 ソフトドリンクサービス',
   'スタンプ5個達成！ソフトドリンクサービス（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/drink.png'),
  ('aaaa0006-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '5スタンプ特典 炙りチャーシュー1枚無料',
   'スタンプ5個達成！炙りチャーシュー1枚無料（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/aburi_chashu.png'),
  ('aaaa0007-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '5スタンプ特典 煮玉子サービス',
   'スタンプ5個達成！煮玉子1個サービス（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/nitamago.png'),
  ('aaaa0008-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   '5スタンプ特典 麺大盛無料',
   'スタンプ5個達成！麺大盛無料（他3つとの選択）',
   'free_item', 60, '/coupons/demo_restaurant/oomori.png')
ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      description = EXCLUDED.description,
      image_url = EXCLUDED.image_url;

-- 4-2. 既存テンプレートの画像URL更新（初回/毎月/10スタンプ = 炙り or 餃子）
UPDATE public.coupon_templates
SET image_url = '/coupons/demo_restaurant/aburi_chashu.png'
WHERE id IN (
  'aaaa0001-0000-0000-0000-000000000001', -- shop_a 初回 炙り
  'aaaa0002-0000-0000-0000-000000000001', -- shop_a 毎月 炙り
  'aaaa0001-0000-0000-0000-000000000002', -- shop_b 初回 炙り
  'aaaa0002-0000-0000-0000-000000000002'  -- shop_b 毎月 炙り
);

UPDATE public.coupon_templates
SET image_url = '/coupons/demo_restaurant/gyoza.png'
WHERE id IN (
  'aaaa0004-0000-0000-0000-000000000001', -- shop_a 10スタンプ 餃子
  'aaaa0004-0000-0000-0000-000000000002'  -- shop_b 10スタンプ 餃子
);

-- 4-3. 旧 5スタンプ選択式テンプレート (aaaa0003) は非アクティブ化
UPDATE public.coupon_templates
SET is_active = false,
    description = description || ' [非推奨: 新しいグループ発行方式に置き換え済み]'
WHERE id IN (
  'aaaa0003-0000-0000-0000-000000000001',
  'aaaa0003-0000-0000-0000-000000000002'
);

-- 4-4. グループ作成 + 紐付け
-- Shop A 5スタンプ グループ
DO $$
DECLARE
  shop_a_mid_group UUID := 'bbbb0001-0000-0000-0000-000000000001';
  shop_b_mid_group    UUID := 'bbbb0001-0000-0000-0000-000000000002';
BEGIN
  -- Shop A: 4 templates を mid_group に紐付け
  INSERT INTO public.coupon_group_templates (group_id, template_id, sort_order) VALUES
    (shop_a_mid_group, 'aaaa0005-0000-0000-0000-000000000001', 1), -- ドリンク
    (shop_a_mid_group, 'aaaa0006-0000-0000-0000-000000000001', 2), -- 炙り
    (shop_a_mid_group, 'aaaa0007-0000-0000-0000-000000000001', 3), -- 煮玉子
    (shop_a_mid_group, 'aaaa0008-0000-0000-0000-000000000001', 4)  -- 大盛
  ON CONFLICT (group_id, template_id) DO NOTHING;

  -- Shop B
  INSERT INTO public.coupon_group_templates (group_id, template_id, sort_order) VALUES
    (shop_b_mid_group, 'aaaa0005-0000-0000-0000-000000000002', 1),
    (shop_b_mid_group, 'aaaa0006-0000-0000-0000-000000000002', 2),
    (shop_b_mid_group, 'aaaa0007-0000-0000-0000-000000000002', 3),
    (shop_b_mid_group, 'aaaa0008-0000-0000-0000-000000000002', 4)
  ON CONFLICT (group_id, template_id) DO NOTHING;

  -- stamp_cards の mid_reward_group_id を設定（mid_reward_coupon_template_id より優先される）
  UPDATE public.stamp_cards
    SET mid_reward_group_id = shop_a_mid_group
    WHERE shop_id = '11111111-1111-1111-1111-111111111111';

  UPDATE public.stamp_cards
    SET mid_reward_group_id = shop_b_mid_group
    WHERE shop_id = '22222222-2222-2222-2222-222222222222';
END $$;

-- ---------- 検証 ----------
SELECT '=== coupon_templates Demo Restaurant ===' AS info;
SELECT id, title, image_url, is_active
FROM public.coupon_templates
WHERE shop_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
ORDER BY shop_id, id;

SELECT '=== coupon_group_templates ===' AS info;
SELECT group_id, template_id, sort_order
FROM public.coupon_group_templates
ORDER BY group_id, sort_order;

SELECT '=== stamp_cards ===' AS info;
SELECT id, shop_id, name, mid_reward_group_id, full_reward_group_id,
       mid_reward_coupon_template_id, reward_coupon_template_id
FROM public.stamp_cards
WHERE shop_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
