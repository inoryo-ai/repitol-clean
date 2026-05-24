-- =====================================================
-- 016: おすすめメニュー項目テーブル
-- LINE に「メニュー」と送信すると Flex Carousel で返信される内容を DB 化
-- =====================================================

CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_org_active
  ON public.menu_items(organization_id, sort_order)
  WHERE is_active = true;

CREATE TRIGGER menu_items_updated_at
  BEFORE UPDATE ON public.menu_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "menu_items_select_org" ON public.menu_items FOR SELECT
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "menu_items_insert_org" ON public.menu_items FOR INSERT
  WITH CHECK (organization_id = public.get_user_organization_id());
CREATE POLICY "menu_items_update_org" ON public.menu_items FOR UPDATE
  USING (organization_id = public.get_user_organization_id());
CREATE POLICY "menu_items_delete_org" ON public.menu_items FOR DELETE
  USING (organization_id = public.get_user_organization_id());

-- 現状ハードコードされているDemo Restaurantのメニューを初期投入
INSERT INTO public.menu_items (organization_id, title, subtitle, image_url, sort_order) VALUES
  ('33333333-3333-3333-3333-333333333333', 'にんにく甘辛味噌らーめん', '限定10食・仕事中は要注意の一杯', '/menu/demo_restaurant/ninniku.jpg', 1),
  ('33333333-3333-3333-3333-333333333333', 'まぜそば', '赤味噌ベース・山椒ピリッと1.5麺', '/menu/demo_restaurant/mazesoba.jpg', 2),
  ('33333333-3333-3333-3333-333333333333', '黒豆味噌ブレンド', '京都丹波の黒豆×九州麦味噌', '/menu/demo_restaurant/kuromame.jpg', 3)
ON CONFLICT DO NOTHING;

INSERT INTO public.schema_migrations (version, name, note) VALUES
  ('016', 'menu_items', 'おすすめメニュー項目テーブル')
ON CONFLICT (version) DO NOTHING;

SELECT id, title, subtitle, sort_order FROM public.menu_items
WHERE organization_id = '33333333-3333-3333-3333-333333333333'
ORDER BY sort_order;
