-- =====================================================
-- 012: shops に短縮コード（code）追加
-- 店頭QRのURLに埋め込む人間可読な短縮コード。
-- 例: https://repitol.app/s/shop_a → shops.code = 'shop_a'
-- =====================================================

ALTER TABLE public.shops
  ADD COLUMN IF NOT EXISTS code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_shops_code ON public.shops(code);

-- Demo Restaurant 2店舗にコード設定
UPDATE public.shops SET code = 'shop_a'
  WHERE id = '11111111-1111-1111-1111-111111111111';
UPDATE public.shops SET code = 'shop_b'
  WHERE id = '22222222-2222-2222-2222-222222222222';

-- 検証
SELECT id, name, code FROM public.shops
WHERE id IN ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
