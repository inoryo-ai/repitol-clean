-- ============================================
-- 修復SQL: 店舗データ再投入 + オーナー紐付け
-- ============================================

-- 1. Demo Restaurantの店舗が存在しなければ作成
INSERT INTO public.shops (id, name, address, genre, plan_type, line_channel_id, line_channel_secret, line_channel_access_token)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Demo Restaurant Shop A',
  '千葉県千葉市中央区shop_a町',
  'ラーメン',
  'starter',
  '0000000000',
  'REDACTED_CHANNEL_SECRET',
  'REDACTED_CHANNEL_ACCESS_TOKEN'
)
ON CONFLICT (id) DO UPDATE SET
  line_channel_id = EXCLUDED.line_channel_id,
  line_channel_secret = EXCLUDED.line_channel_secret,
  line_channel_access_token = EXCLUDED.line_channel_access_token;

INSERT INTO public.shops (id, name, address, genre, plan_type, line_channel_id, line_channel_secret, line_channel_access_token)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  'Demo Restaurant Shop B',
  '千葉県千葉市若葉区shop_b',
  'ラーメン',
  'starter',
  '0000000000',
  'REDACTED_CHANNEL_SECRET',
  'REDACTED_CHANNEL_ACCESS_TOKEN'
)
ON CONFLICT (id) DO UPDATE SET
  line_channel_id = EXCLUDED.line_channel_id,
  line_channel_secret = EXCLUDED.line_channel_secret,
  line_channel_access_token = EXCLUDED.line_channel_access_token;

-- 2. クーポンテンプレート（存在しなければ作成）

-- Shop A
INSERT INTO public.coupon_templates (id, shop_id, title, description, coupon_type, valid_days)
VALUES
  ('aaaa0001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '炙りチャーシュー1枚無料', 'LINE友だち追加ありがとうございます！トッピング炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0002-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '毎月クーポン 炙りチャーシュー1枚無料', 'いつもご来店ありがとうございます！今月も炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0003-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5スタンプ特典（大盛無料 or 炙りチャーシュー1枚無料）', 'スタンプ5個達成！大盛無料または炙りチャーシュー1枚無料からお選びください', 'free_item', 60),
  ('aaaa0004-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '10スタンプ特典 餃子無料', 'スタンプカードコンプリート！餃子1皿サービス', 'free_item', 60)
ON CONFLICT (id) DO NOTHING;

-- Shop B
INSERT INTO public.coupon_templates (id, shop_id, title, description, coupon_type, valid_days)
VALUES
  ('aaaa0001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '炙りチャーシュー1枚無料', 'LINE友だち追加ありがとうございます！トッピング炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '毎月クーポン 炙りチャーシュー1枚無料', 'いつもご来店ありがとうございます！今月も炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0003-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '5スタンプ特典（大盛無料 or 炙りチャーシュー1枚無料）', 'スタンプ5個達成！大盛無料または炙りチャーシュー1枚無料からお選びください', 'free_item', 60),
  ('aaaa0004-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '10スタンプ特典 餃子無料', 'スタンプカードコンプリート！餃子1皿サービス', 'free_item', 60)
ON CONFLICT (id) DO NOTHING;

-- 3. スタンプカード設定
INSERT INTO public.stamp_cards (id, shop_id, name, total_stamps, mid_stamps, min_amount, reward_coupon_template_id, mid_reward_coupon_template_id)
VALUES
  ('bbbb0001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Demo Restaurantスタンプカード', 10, 5, 1000, 'aaaa0004-0000-0000-0000-000000000001', 'aaaa0003-0000-0000-0000-000000000001'),
  ('bbbb0001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Demo Restaurantスタンプカード', 10, 5, 1000, 'aaaa0004-0000-0000-0000-000000000002', 'aaaa0003-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- 4. 自動配信トリガー（友だち追加時）
INSERT INTO public.auto_triggers (shop_id, trigger_type, trigger_value, coupon_template_id, message_text)
SELECT '11111111-1111-1111-1111-111111111111', 'first_visit', 1, 'aaaa0001-0000-0000-0000-000000000001',
  'Demo Restaurantへようこそ！🍜 LINE友だち追加ありがとうございます。初回特典として「炙りチャーシュー1枚無料クーポン」をプレゼント！次回ご来店時にスタッフにお見せください。'
WHERE NOT EXISTS (
  SELECT 1 FROM public.auto_triggers WHERE shop_id = '11111111-1111-1111-1111-111111111111' AND trigger_type = 'first_visit'
);

INSERT INTO public.auto_triggers (shop_id, trigger_type, trigger_value, coupon_template_id, message_text)
SELECT '22222222-2222-2222-2222-222222222222', 'first_visit', 1, 'aaaa0001-0000-0000-0000-000000000002',
  'Demo Restaurantへようこそ！🍜 LINE友だち追加ありがとうございます。初回特典として「炙りチャーシュー1枚無料クーポン」をプレゼント！次回ご来店時にスタッフにお見せください。'
WHERE NOT EXISTS (
  SELECT 1 FROM public.auto_triggers WHERE shop_id = '22222222-2222-2222-2222-222222222222' AND trigger_type = 'first_visit'
);

-- 5. サインアップ時に自動作成された空の店舗を削除
DELETE FROM public.shops
WHERE id NOT IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
)
AND id IN (
  SELECT shop_id FROM public.profiles WHERE email = 'demo-owner@example.com'
);

-- 6. オーナーアカウントをShop Aに紐付け
UPDATE public.profiles
SET shop_id = '11111111-1111-1111-1111-111111111111',
    role = 'owner'
WHERE email = 'demo-owner@example.com';
