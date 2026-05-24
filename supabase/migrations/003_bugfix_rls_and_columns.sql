-- ============================================
-- バグ修正マイグレーション
-- S02: shops INSERT RLS追加
-- S03: message_logs INSERT RLS追加
-- L09: messages_sent_this_month月初リセット関数
-- L01/L02: スタンプ・来店カウントのアトミック更新関数
-- ============================================

-- S02: shops テーブルにINSERTポリシー追加（サインアップ時に店舗作成が必要）
CREATE POLICY "shops_insert_authenticated" ON public.shops
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- S03: message_logs テーブルにINSERTポリシー追加
CREATE POLICY "messages_insert" ON public.message_logs
  FOR INSERT WITH CHECK (shop_id = public.get_user_shop_id());

-- L09: 月初に messages_sent_this_month をリセットする関数
CREATE OR REPLACE FUNCTION public.reset_monthly_message_count()
RETURNS void AS $$
BEGIN
  UPDATE public.shops SET messages_sent_this_month = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- L01: スタンプのアトミック更新関数（レースコンディション防止）
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
  -- ロック付きで取得
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

-- L01: スタンプリセット（コンプリート時）
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

-- L01: 中間報酬クレーム
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

-- L02: 来店カウントのアトミック更新
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

-- L03: 配信カウントのアトミック更新
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
