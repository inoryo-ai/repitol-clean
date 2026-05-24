-- =====================================================
-- 018: 管理画面アップロード用 Supabase Storage バケット
-- broadcast / menu_items / coupon_templates の画像アップロード先を統一
-- =====================================================

-- バケット作成（public read）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,                               -- 公開: LINE Messaging API から originalContentUrl で参照可能
  10 * 1024 * 1024,                   -- 10MB 上限
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 既存の同名 policy を消してから再作成（idempotent）
DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "media_authenticated_write" ON storage.objects;
DROP POLICY IF EXISTS "media_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "media_authenticated_delete" ON storage.objects;

-- 公開読み取り（一斉配信先がLINE側で取得するために必要）
CREATE POLICY "media_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

-- 認証ユーザーのみアップロード可
CREATE POLICY "media_authenticated_write" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media');

CREATE POLICY "media_authenticated_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media');

CREATE POLICY "media_authenticated_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'media');

-- 履歴
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('018', '018_media_storage', now())
ON CONFLICT (version) DO NOTHING;
