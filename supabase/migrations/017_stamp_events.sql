-- =====================================================
-- 017: スタンプ取得イベントの履歴テーブル
--
-- 目的:
-- - 各スタンプが「どの店舗で押されたか」を 1スタンプ = 1イベント として記録
-- - スタンプUIに店舗別オーバーレイ（shop_a「仁」黄色 / shop_b「小」濃赤）を表示
-- - 顧客詳細画面のスタンプ履歴（日時・店舗）に利用
--
-- 方針:
-- 1. customer_stamp_events テーブルを新設
-- 2. atomic_increment_stamp 関数を改修して、加算と同時に event を INSERT
-- 3. reset_stamp_on_complete 関数では events を削除しない（cycle カラムで何周目か区別）
-- 4. 既存の customer_stamps について visit_logs から復元（最新 current_stamps 個分）
--    残り（足りない分）は shop_id=NULL で UI が「？」フォールバック表示
-- =====================================================

-- ---------- 1. customer_stamp_events テーブル ----------
CREATE TABLE IF NOT EXISTS public.customer_stamp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_stamp_id UUID NOT NULL REFERENCES public.customer_stamps(id) ON DELETE CASCADE,
  shop_id UUID REFERENCES public.shops(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stamped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cycle INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_stamp_events_stamp_time
  ON public.customer_stamp_events(customer_stamp_id, stamped_at DESC);
CREATE INDEX IF NOT EXISTS idx_stamp_events_org_time
  ON public.customer_stamp_events(organization_id, stamped_at DESC);

-- ---------- 2. RLS（organization 単位） ----------
ALTER TABLE public.customer_stamp_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stamp_events_select_org" ON public.customer_stamp_events;
DROP POLICY IF EXISTS "stamp_events_insert_org" ON public.customer_stamp_events;

CREATE POLICY "stamp_events_select_org" ON public.customer_stamp_events FOR SELECT
  USING (organization_id = public.get_user_organization_id());

CREATE POLICY "stamp_events_insert_org" ON public.customer_stamp_events FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());

-- ---------- 3. 既存データ復元 ----------
-- 各 customer_stamps について、その customer の visit_logs を最新から取得し、
-- current_stamps 個分を「現在の周（cycle = completed_count）」の event として挿入。
-- visit_logs が足りない場合は shop_id=NULL で埋める（UI で「？」フォールバック）。
DO $$
DECLARE
  rec RECORD;
  v_org UUID;
  v_inserted INT;
  v_missing INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  FOR rec IN
    SELECT cs.id AS stamp_id,
           cs.customer_id,
           cs.current_stamps,
           cs.completed_count,
           sc.organization_id AS org_id
    FROM public.customer_stamps cs
    JOIN public.stamp_cards sc ON sc.id = cs.stamp_card_id
    WHERE cs.current_stamps > 0
  LOOP
    v_org := rec.org_id;

    -- 既に events が存在する場合はスキップ（再実行時の冪等性確保）
    IF EXISTS (
      SELECT 1 FROM public.customer_stamp_events
      WHERE customer_stamp_id = rec.stamp_id AND cycle = rec.completed_count
    ) THEN
      CONTINUE;
    END IF;

    -- visit_logs から最新 current_stamps 件を取得（昇順で挿入したいので部分集合を反転）
    INSERT INTO public.customer_stamp_events
      (customer_stamp_id, shop_id, organization_id, stamped_at, cycle)
    SELECT
      rec.stamp_id,
      vl.shop_id,
      v_org,
      vl.visited_at,
      rec.completed_count
    FROM (
      SELECT shop_id, visited_at
      FROM public.visit_logs
      WHERE customer_id = rec.customer_id
      ORDER BY visited_at DESC
      LIMIT rec.current_stamps
    ) vl
    ORDER BY vl.visited_at ASC;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- 不足分は shop_id=NULL で埋める（古い時刻として現在の少し前を使用）
    v_missing := rec.current_stamps - v_inserted;
    IF v_missing > 0 THEN
      INSERT INTO public.customer_stamp_events
        (customer_stamp_id, shop_id, organization_id, stamped_at, cycle)
      SELECT
        rec.stamp_id,
        NULL,
        v_org,
        v_now - (interval '1 second' * (v_missing - g + 1) * 60),
        rec.completed_count
      FROM generate_series(1, v_missing) AS g;
    END IF;
  END LOOP;
END $$;

-- ---------- 4. atomic_increment_stamp 改修 ----------
-- migration 003 の関数を上書き。スタンプ加算後に customer_stamp_events を INSERT する。
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
  v_org UUID;
BEGIN
  -- 組織IDを stamp_card から取得（events に保存するため）
  SELECT organization_id INTO v_org
  FROM public.stamp_cards
  WHERE id = p_stamp_card_id;

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

  -- スタンプイベントを記録（cycle = 現在の completed_count = 何周目か）
  -- v_org が NULL の場合は記録しない（防御的）
  IF v_org IS NOT NULL THEN
    INSERT INTO public.customer_stamp_events
      (customer_stamp_id, shop_id, organization_id, stamped_at, cycle)
    VALUES
      (v_row.id, p_shop_id, v_org, now(), v_row.completed_count);
  END IF;

  RETURN QUERY SELECT v_row.current_stamps, v_row.completed_count, v_row.mid_reward_claimed, v_created;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------- 5. reset_stamp_on_complete は変更しない ----------
-- events は履歴として残し、cycle カラムで「現在の周」と「過去の周」を区別する。
-- 現在の周のイベント = cycle = customer_stamps.completed_count

INSERT INTO public.schema_migrations (version, name, note) VALUES
  ('017', 'stamp_events', 'スタンプ取得イベント履歴（店舗判別 + cycle）')
ON CONFLICT (version) DO NOTHING;

-- ---------- 6. 検証 ----------
SELECT '=== customer_stamp_events 件数 ===' AS info;
SELECT count(*) AS total_events FROM public.customer_stamp_events;

SELECT '=== shop_id 別件数 ===' AS info;
SELECT s.code, s.name, count(*) AS cnt
FROM public.customer_stamp_events e
LEFT JOIN public.shops s ON s.id = e.shop_id
GROUP BY s.code, s.name
ORDER BY cnt DESC;

SELECT '=== customer_stamps の現在値と events 件数の整合 ===' AS info;
SELECT
  cs.id,
  cs.current_stamps,
  cs.completed_count,
  count(e.id) FILTER (WHERE e.cycle = cs.completed_count) AS events_in_current_cycle
FROM public.customer_stamps cs
LEFT JOIN public.customer_stamp_events e ON e.customer_stamp_id = cs.id
GROUP BY cs.id, cs.current_stamps, cs.completed_count
HAVING cs.current_stamps <> count(e.id) FILTER (WHERE e.cycle = cs.completed_count);
