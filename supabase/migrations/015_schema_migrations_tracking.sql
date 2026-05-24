-- =====================================================
-- 015: migration 適用履歴の追跡テーブル
--
-- 目的:
-- - 本番DBにどの migration が適用済みか明示的に記録
-- - 新環境構築時に「どこまで進んでるか」が一目で分かる
-- - 差分適用ミスを防ぐ
-- =====================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version TEXT PRIMARY KEY,      -- 例: "001", "011"
  name TEXT NOT NULL,            -- 例: "repitoru_schema"
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT,                 -- 将来: SQL のハッシュで改ざん検知
  note TEXT
);

-- 既存 migration の履歴を後から流し込む
INSERT INTO public.schema_migrations (version, name, note) VALUES
  ('001', 'repitoru_schema', '初期スキーマ'),
  ('002', 'demo_restaurant', 'Demo Restaurant初期セットアップ'),
  ('003', 'bugfix_rls_and_columns', 'RLS + カラム修正'),
  ('004', 'seed_demo_restaurant', 'Demo Restaurantシードデータ'),
  ('005', 'update_line_credentials', 'LINE認証情報更新'),
  ('006', 'link_owner_to_demo_restaurant', 'オーナーアカウント紐付け'),
  ('007', 'fix_all', '諸バグ修正'),
  ('008', 'complete_reset', 'LINE認証情報再設定 + シード再投入'),
  ('009', 'add_nitamago_to_mid_reward', '煮玉子を中間特典に追加'),
  ('010', 'exclusive_coupon_groups', '排他的クーポングループ機能'),
  ('011', 'organization_unification', '組織単位のデータ統合'),
  ('012', 'add_shop_code', 'shops に短縮コード追加'),
  ('013', 'separate_stamp_rewards', '配布用クーポンとスタンプ特典の分離'),
  ('014', 'customer_shop_memberships', '顧客×店舗LINE OAの友だち関係テーブル'),
  ('015', 'schema_migrations_tracking', 'migration 履歴追跡テーブル')
ON CONFLICT (version) DO NOTHING;

SELECT version, name, applied_at FROM public.schema_migrations ORDER BY version;
