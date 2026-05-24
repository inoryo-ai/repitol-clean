-- ============================================
-- リピトル 全マイグレーション統合版
-- Supabase SQL Editor に貼り付けて実行
-- 実行順: 001 → 002 → 003
-- ============================================

-- ============================================
-- 001: 初期スキーマ
-- ============================================

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. shops（店舗）
CREATE TABLE public.shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  genre TEXT,
  plan_type TEXT NOT NULL DEFAULT 'starter' CHECK (plan_type IN ('starter', 'standard', 'pro')),
  line_channel_id TEXT,
  line_channel_secret TEXT,
  line_channel_access_token TEXT,
  messages_sent_this_month INTEGER NOT NULL DEFAULT 0,
  messages_limit INTEGER NOT NULL DEFAULT 200,
  customers_limit INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON public.shops
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 2. profiles（スタッフ）
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX idx_profiles_shop ON public.profiles(shop_id);

-- 3. customers（顧客）
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  display_name TEXT,
  picture_url TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0,
  first_visit_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_visit_at TIMESTAMPTZ,
  tags TEXT[] NOT NULL DEFAULT '{}',
  memo TEXT,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, line_user_id)
);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX idx_customers_shop ON public.customers(shop_id);
CREATE INDEX idx_customers_line ON public.customers(shop_id, line_user_id);
CREATE INDEX idx_customers_visit ON public.customers(shop_id, visit_count DESC);
CREATE INDEX idx_customers_last_visit ON public.customers(shop_id, last_visit_at);

-- 4. visit_logs（来店ログ）
CREATE TABLE public.visit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  staff_id UUID REFERENCES auth.users(id),
  memo TEXT
);

CREATE INDEX idx_visits_customer ON public.visit_logs(customer_id, visited_at DESC);
CREATE INDEX idx_visits_shop_date ON public.visit_logs(shop_id, visited_at DESC);

-- 5. coupon_templates（クーポンテンプレート）
CREATE TABLE public.coupon_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  coupon_type TEXT NOT NULL DEFAULT 'custom' CHECK (coupon_type IN ('discount_percent', 'discount_yen', 'free_item', 'custom')),
  discount_value INTEGER,
  image_url TEXT,
  valid_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupons_shop ON public.coupon_templates(shop_id);

-- 6. coupons_issued（発行済みクーポン）
CREATE TABLE public.coupons_issued (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.coupon_templates(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  coupon_code TEXT NOT NULL DEFAULT encode(gen_random_bytes(6), 'hex')
);

CREATE INDEX idx_issued_customer ON public.coupons_issued(customer_id, status);
CREATE INDEX idx_issued_shop ON public.coupons_issued(shop_id);
CREATE INDEX idx_issued_code ON public.coupons_issued(coupon_code);

-- 7. auto_triggers（自動配信トリガー）
CREATE TABLE public.auto_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('first_visit', 'nth_visit', 'days_absent', 'manual')),
  trigger_value INTEGER NOT NULL DEFAULT 1,
  coupon_template_id UUID REFERENCES public.coupon_templates(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_triggers_shop ON public.auto_triggers(shop_id);

-- 8. stamp_cards（スタンプカード設定）
CREATE TABLE public.stamp_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'スタンプカード',
  total_stamps INTEGER NOT NULL DEFAULT 10,
  reward_coupon_template_id UUID REFERENCES public.coupon_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stamps_shop ON public.stamp_cards(shop_id);

-- 9. customer_stamps（顧客スタンプ進捗）
CREATE TABLE public.customer_stamps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stamp_card_id UUID NOT NULL REFERENCES public.stamp_cards(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  current_stamps INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(stamp_card_id, customer_id)
);

CREATE TRIGGER customer_stamps_updated_at
  BEFORE UPDATE ON public.customer_stamps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 10. reservations（予約）
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  line_user_id TEXT,
  party_size INTEGER NOT NULL DEFAULT 1,
  reserved_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reservations_shop ON public.reservations(shop_id, reserved_at);
CREATE INDEX idx_reservations_reminder ON public.reservations(reserved_at, reminder_sent) WHERE status = 'confirmed';

-- 11. message_logs（配信ログ）
CREATE TABLE public.message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT
);

CREATE INDEX idx_messages_shop ON public.message_logs(shop_id, sent_at DESC);

-- RLS ポリシー（店舗ごとデータ分離）
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons_issued ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stamp_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_stamps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_shop_id()
RETURNS UUID AS $$
  SELECT shop_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "shops_select_own" ON public.shops FOR SELECT USING (id = public.get_user_shop_id());
CREATE POLICY "shops_update_own" ON public.shops FOR UPDATE USING (id = public.get_user_shop_id());

CREATE POLICY "customers_select" ON public.customers FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "customers_insert" ON public.customers FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());
CREATE POLICY "customers_update" ON public.customers FOR UPDATE USING (shop_id = public.get_user_shop_id());
CREATE POLICY "customers_delete" ON public.customers FOR DELETE USING (shop_id = public.get_user_shop_id());

CREATE POLICY "visits_select" ON public.visit_logs FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "visits_insert" ON public.visit_logs FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());

CREATE POLICY "coupon_tpl_select" ON public.coupon_templates FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "coupon_tpl_insert" ON public.coupon_templates FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());
CREATE POLICY "coupon_tpl_update" ON public.coupon_templates FOR UPDATE USING (shop_id = public.get_user_shop_id());
CREATE POLICY "coupon_tpl_delete" ON public.coupon_templates FOR DELETE USING (shop_id = public.get_user_shop_id());

CREATE POLICY "coupons_issued_select" ON public.coupons_issued FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "coupons_issued_insert" ON public.coupons_issued FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());
CREATE POLICY "coupons_issued_update" ON public.coupons_issued FOR UPDATE USING (shop_id = public.get_user_shop_id());

CREATE POLICY "triggers_select" ON public.auto_triggers FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "triggers_insert" ON public.auto_triggers FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());
CREATE POLICY "triggers_update" ON public.auto_triggers FOR UPDATE USING (shop_id = public.get_user_shop_id());
CREATE POLICY "triggers_delete" ON public.auto_triggers FOR DELETE USING (shop_id = public.get_user_shop_id());

CREATE POLICY "stamps_select" ON public.stamp_cards FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "stamps_insert" ON public.stamp_cards FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());
CREATE POLICY "stamps_update" ON public.stamp_cards FOR UPDATE USING (shop_id = public.get_user_shop_id());

CREATE POLICY "cstamps_select" ON public.customer_stamps FOR SELECT USING (
  stamp_card_id IN (SELECT id FROM public.stamp_cards WHERE shop_id = public.get_user_shop_id())
);
CREATE POLICY "cstamps_insert" ON public.customer_stamps FOR INSERT WITH CHECK (
  stamp_card_id IN (SELECT id FROM public.stamp_cards WHERE shop_id = public.get_user_shop_id())
);
CREATE POLICY "cstamps_update" ON public.customer_stamps FOR UPDATE USING (
  stamp_card_id IN (SELECT id FROM public.stamp_cards WHERE shop_id = public.get_user_shop_id())
);

CREATE POLICY "reservations_select" ON public.reservations FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "reservations_insert" ON public.reservations FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());
CREATE POLICY "reservations_update" ON public.reservations FOR UPDATE USING (shop_id = public.get_user_shop_id());
CREATE POLICY "reservations_delete" ON public.reservations FOR DELETE USING (shop_id = public.get_user_shop_id());

CREATE POLICY "messages_select" ON public.message_logs FOR SELECT USING (shop_id = public.get_user_shop_id());

-- ============================================
-- 002: Demo Restaurant向け拡張
-- ============================================

ALTER TABLE public.stamp_cards
  ADD COLUMN IF NOT EXISTS mid_stamps INTEGER,
  ADD COLUMN IF NOT EXISTS mid_reward_coupon_template_id UUID REFERENCES public.coupon_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS min_amount INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.stamp_cards.mid_stamps IS '中間特典のスタンプ数（例: 5）';
COMMENT ON COLUMN public.stamp_cards.mid_reward_coupon_template_id IS '中間特典のクーポンテンプレートID';
COMMENT ON COLUMN public.stamp_cards.min_amount IS 'スタンプ付与に必要な最低会計金額（円）';

ALTER TABLE public.customer_stamps
  ADD COLUMN IF NOT EXISTS shop_id UUID REFERENCES public.shops(id) ON DELETE CASCADE;

UPDATE public.customer_stamps cs
SET shop_id = sc.shop_id
FROM public.stamp_cards sc
WHERE cs.stamp_card_id = sc.id
  AND cs.shop_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_stamps_shop ON public.customer_stamps(shop_id);

CREATE POLICY "cstamps_select_shop" ON public.customer_stamps FOR SELECT USING (
  shop_id = public.get_user_shop_id()
);

CREATE TABLE IF NOT EXISTS public.monthly_coupon_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  coupon_template_id UUID NOT NULL REFERENCES public.coupon_templates(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(shop_id, customer_id, month_number)
);

ALTER TABLE public.monthly_coupon_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monthly_log_select" ON public.monthly_coupon_log FOR SELECT USING (shop_id = public.get_user_shop_id());
CREATE POLICY "monthly_log_insert" ON public.monthly_coupon_log FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());

CREATE INDEX idx_monthly_log_customer ON public.monthly_coupon_log(shop_id, customer_id);

ALTER TABLE public.customer_stamps
  ADD COLUMN IF NOT EXISTS mid_reward_claimed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_stamps.mid_reward_claimed IS '中間特典（5個）を受け取り済みか';

-- ============================================
-- 003: バグ修正（RLS + アトミック関数）
-- ============================================

CREATE POLICY "shops_insert_authenticated" ON public.shops
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "messages_insert" ON public.message_logs
  FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());

CREATE OR REPLACE FUNCTION public.reset_monthly_message_count()
RETURNS void AS $$
BEGIN
  UPDATE public.shops SET messages_sent_this_month = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.atomic_increment_stamp(
  p_stamp_card_id UUID,
  p_customer_id UUID,
  p_shop_id UUID,
  p_total_stamps INTEGER,
  p_mid_stamps INTEGER DEFAULT NULL
)
RETURNS TABLE(
  new_current_stamps INTEGER,
  new_completed_count INTEGER,
  new_mid_reward_claimed BOOLEAN,
  was_created BOOLEAN
) AS $$
DECLARE
  v_row public.customer_stamps%ROWTYPE;
  v_created BOOLEAN := false;
BEGIN
  SELECT * INTO v_row
  FROM public.customer_stamps
  WHERE stamp_card_id = p_stamp_card_id AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.customer_stamps (stamp_card_id, customer_id, shop_id, current_stamps, completed_count, mid_reward_claimed)
    VALUES (p_stamp_card_id, p_customer_id, p_shop_id, 1, 0, false)
    RETURNING * INTO v_row;
    v_created := true;
  ELSE
    UPDATE public.customer_stamps
    SET current_stamps = current_stamps + 1,
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY SELECT v_row.current_stamps, v_row.completed_count, v_row.mid_reward_claimed, v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.reset_stamp_on_complete(
  p_stamp_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.customer_stamps
  SET current_stamps = 0,
      completed_count = completed_count + 1,
      mid_reward_claimed = false,
      updated_at = now()
  WHERE id = p_stamp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.claim_mid_reward(
  p_stamp_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.customer_stamps
  SET mid_reward_claimed = true,
      updated_at = now()
  WHERE id = p_stamp_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.atomic_increment_visit_count(
  p_customer_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.customers
  SET visit_count = visit_count + 1,
      last_visit_at = now()
  WHERE id = p_customer_id
  RETURNING visit_count INTO v_new_count;
  RETURN v_new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.atomic_increment_message_count(
  p_shop_id UUID,
  p_count INTEGER
)
RETURNS void AS $$
BEGIN
  UPDATE public.shops
  SET messages_sent_this_month = messages_sent_this_month + p_count
  WHERE id = p_shop_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
