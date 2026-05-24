-- ============================================
-- 完全リセット＆再構築（これ1本で全部やる）
-- ============================================

-- まず既存データを確認
DO $$
BEGIN
  RAISE NOTICE '=== 診断開始 ===';
END $$;

-- 店舗にLINE認証情報を確実に設定
UPDATE public.shops
SET
  line_channel_id = '0000000000',
  line_channel_secret = 'REDACTED_CHANNEL_SECRET',
  line_channel_access_token = 'REDACTED_CHANNEL_ACCESS_TOKEN'
WHERE id = '11111111-1111-1111-1111-111111111111';

UPDATE public.shops
SET
  line_channel_id = '0000000000',
  line_channel_secret = 'REDACTED_CHANNEL_SECRET',
  line_channel_access_token = 'REDACTED_CHANNEL_ACCESS_TOKEN'
WHERE id = '22222222-2222-2222-2222-222222222222';

-- クーポンテンプレート（Shop A）
INSERT INTO public.coupon_templates (id, shop_id, title, description, coupon_type, valid_days)
VALUES
  ('aaaa0001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '炙りチャーシュー1枚無料', 'LINE友だち追加ありがとうございます！トッピング炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0002-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '毎月クーポン 炙りチャーシュー1枚無料', 'いつもご来店ありがとうございます！今月も炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0003-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '5スタンプ特典（大盛 / チャーシュー1枚 / 煮卵1個）', 'スタンプ5個達成！大盛無料・炙りチャーシュー1枚無料・煮卵1個無料からお選びください', 'free_item', 60),
  ('aaaa0004-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '10スタンプ特典 餃子無料', 'スタンプカードコンプリート！餃子1皿サービス', 'free_item', 60)
ON CONFLICT (id) DO NOTHING;

-- クーポンテンプレート（Shop B）
INSERT INTO public.coupon_templates (id, shop_id, title, description, coupon_type, valid_days)
VALUES
  ('aaaa0001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '炙りチャーシュー1枚無料', 'LINE友だち追加ありがとうございます！トッピング炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '毎月クーポン 炙りチャーシュー1枚無料', 'いつもご来店ありがとうございます！今月も炙りチャーシュー1枚サービス', 'free_item', 30),
  ('aaaa0003-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '5スタンプ特典（大盛 / チャーシュー1枚 / 煮卵1個）', 'スタンプ5個達成！大盛無料・炙りチャーシュー1枚無料・煮卵1個無料からお選びください', 'free_item', 60),
  ('aaaa0004-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', '10スタンプ特典 餃子無料', 'スタンプカードコンプリート！餃子1皿サービス', 'free_item', 60)
ON CONFLICT (id) DO NOTHING;

-- スタンプカード設定
INSERT INTO public.stamp_cards (id, shop_id, name, total_stamps, mid_stamps, min_amount, reward_coupon_template_id, mid_reward_coupon_template_id)
VALUES
  ('bbbb0001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Demo Restaurantスタンプカード', 10, 5, 1000, 'aaaa0004-0000-0000-0000-000000000001', 'aaaa0003-0000-0000-0000-000000000001'),
  ('bbbb0001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Demo Restaurantスタンプカード', 10, 5, 1000, 'aaaa0004-0000-0000-0000-000000000002', 'aaaa0003-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- 自動配信トリガー（既存を削除して再作成）
DELETE FROM public.auto_triggers WHERE shop_id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

INSERT INTO public.auto_triggers (shop_id, trigger_type, trigger_value, coupon_template_id, message_text, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'first_visit', 1, 'aaaa0001-0000-0000-0000-000000000001', '初回特典', true),
  ('22222222-2222-2222-2222-222222222222', 'first_visit', 1, 'aaaa0001-0000-0000-0000-000000000002', '初回特典', true);

-- オーナーアカウント紐付け
UPDATE public.profiles
SET shop_id = '11111111-1111-1111-1111-111111111111', role = 'owner'
WHERE email = 'demo-owner@example.com';

-- 既存の顧客データをクリア（テスト用）
DELETE FROM public.customers WHERE shop_id = '11111111-1111-1111-1111-111111111111';

-- ============================================
-- 検証（結果が表示される）
-- ============================================
SELECT '店舗' as category, name,
  CASE WHEN line_channel_secret IS NOT NULL THEN 'OK' ELSE 'NG' END as line_secret,
  CASE WHEN line_channel_access_token IS NOT NULL THEN 'OK' ELSE 'NG' END as line_token
FROM public.shops
WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')

UNION ALL

SELECT 'クーポン数', count(*)::text, '', ''
FROM public.coupon_templates
WHERE shop_id = '11111111-1111-1111-1111-111111111111'

UNION ALL

SELECT 'トリガー数', count(*)::text, '', ''
FROM public.auto_triggers
WHERE shop_id = '11111111-1111-1111-1111-111111111111'

UNION ALL

SELECT 'スタンプカード', count(*)::text, '', ''
FROM public.stamp_cards
WHERE shop_id = '11111111-1111-1111-1111-111111111111'

UNION ALL

SELECT 'オーナー', shop_id::text, role, ''
FROM public.profiles
WHERE email = 'demo-owner@example.com';
