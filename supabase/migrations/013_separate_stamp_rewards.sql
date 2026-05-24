-- =====================================================
-- 013: クーポンの用途分離（配布用 / スタンプ特典用）
--
-- 変更概要:
-- 1. 既存 aaaa* テンプレートはすべて「配布用」として残す（編集・配信に使える）
-- 2. スタンプ特典用の新テンプレート cccc* を placeholder として新規作成
--    - 5スタンプ中間特典 4 枚（未設定スロット A/B/C/D）
--    - 10スタンプコンプリート特典 1 枚（未設定スロット）
-- 3. 新しい coupon_group (mid_reward) を作成、cccc* を紐付け
-- 4. stamp_cards の mid_reward_group_id / reward_coupon_template_id を新テンプレートに切替
-- 5. 旧 aaaa0005-0008 の mid_reward グループ参照を外し、配布用として利用可能にする
--
-- 画像: /coupons/demo_restaurant/placeholder_stamp_mid_{1..4}.png と placeholder_stamp_full.png
-- タイトル: 「[スタンプ特典 A/B/C/D]」などプレースホルダー
-- 説明: 空（管理画面から編集）
-- =====================================================

-- ---------- 0. coupon_templates.shop_id を NULL 許容に（組織共通テンプレート対応） ----------
ALTER TABLE public.coupon_templates ALTER COLUMN shop_id DROP NOT NULL;

-- ---------- 1. スタンプ特典用テンプレート (cccc*) ----------
INSERT INTO public.coupon_templates (id, shop_id, organization_id, title, description, coupon_type, valid_days, is_active, image_url)
VALUES
  ('cccc0001-0000-0000-0000-000000000000', NULL,
   '33333333-3333-3333-3333-333333333333',
   '[5スタンプ特典 A]', '', 'custom', 60, true, '/coupons/demo_restaurant/placeholder_stamp_mid_1.png'),
  ('cccc0002-0000-0000-0000-000000000000', NULL,
   '33333333-3333-3333-3333-333333333333',
   '[5スタンプ特典 B]', '', 'custom', 60, true, '/coupons/demo_restaurant/placeholder_stamp_mid_2.png'),
  ('cccc0003-0000-0000-0000-000000000000', NULL,
   '33333333-3333-3333-3333-333333333333',
   '[5スタンプ特典 C]', '', 'custom', 60, true, '/coupons/demo_restaurant/placeholder_stamp_mid_3.png'),
  ('cccc0004-0000-0000-0000-000000000000', NULL,
   '33333333-3333-3333-3333-333333333333',
   '[5スタンプ特典 D]', '', 'custom', 60, true, '/coupons/demo_restaurant/placeholder_stamp_mid_4.png'),
  ('cccc0009-0000-0000-0000-000000000000', NULL,
   '33333333-3333-3333-3333-333333333333',
   '[10スタンプ コンプリート特典]', '', 'custom', 60, true, '/coupons/demo_restaurant/placeholder_stamp_full.png')
ON CONFLICT (id) DO UPDATE
  SET title = EXCLUDED.title,
      image_url = EXCLUDED.image_url;

-- ---------- 3. 新しい mid_reward グループ ----------
-- group_id = cccc0000-0000-0000-0000-00000000mid0 を使う
DELETE FROM public.coupon_group_templates
  WHERE group_id = 'cccc0000-0000-0000-0000-00000000c1d0';

INSERT INTO public.coupon_group_templates (group_id, template_id, sort_order) VALUES
  ('cccc0000-0000-0000-0000-00000000c1d0', 'cccc0001-0000-0000-0000-000000000000', 1),
  ('cccc0000-0000-0000-0000-00000000c1d0', 'cccc0002-0000-0000-0000-000000000000', 2),
  ('cccc0000-0000-0000-0000-00000000c1d0', 'cccc0003-0000-0000-0000-000000000000', 3),
  ('cccc0000-0000-0000-0000-00000000c1d0', 'cccc0004-0000-0000-0000-000000000000', 4)
ON CONFLICT DO NOTHING;

-- ---------- 4. スタンプカードの参照を切り替え ----------
UPDATE public.stamp_cards
SET mid_reward_group_id = 'cccc0000-0000-0000-0000-00000000c1d0'::uuid,
    mid_reward_coupon_template_id = NULL,
    reward_coupon_template_id = 'cccc0009-0000-0000-0000-000000000000'::uuid,
    full_reward_group_id = NULL
WHERE organization_id = '33333333-3333-3333-3333-333333333333'
  AND is_active = true;

-- ---------- 5. 旧 aaaa* は全て「配布用」として生かす（タイトルはそのまま） ----------
-- 非アクティブだった aaaa0003 を再度アクティブにして、配布用として使えるようにする
UPDATE public.coupon_templates
SET is_active = true,
    description = '（旧選択式特典 / 配布用として利用可）'
WHERE id IN (
  'aaaa0003-0000-0000-0000-000000000001',
  'aaaa0003-0000-0000-0000-000000000002'
);

-- ---------- 検証 ----------
SELECT '=== 配布用 aaaa* ===' AS info;
SELECT id, title, is_active FROM public.coupon_templates
WHERE organization_id = '33333333-3333-3333-3333-333333333333'
  AND id::text LIKE 'aaaa%'
ORDER BY id;

SELECT '=== スタンプ特典 cccc* ===' AS info;
SELECT id, title, image_url, is_active FROM public.coupon_templates
WHERE organization_id = '33333333-3333-3333-3333-333333333333'
  AND id::text LIKE 'cccc%'
ORDER BY id;

SELECT '=== スタンプカード参照 ===' AS info;
SELECT id, name, mid_reward_group_id, reward_coupon_template_id
FROM public.stamp_cards
WHERE organization_id = '33333333-3333-3333-3333-333333333333'
  AND is_active = true;
