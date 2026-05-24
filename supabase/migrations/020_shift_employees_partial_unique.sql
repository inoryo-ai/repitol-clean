-- =====================================================
-- 020: shift_employees の一意制約を「is_active = true」のみに限定
-- これにより、無効化(soft-delete)済みの名前と同名で再登録できる
-- =====================================================

ALTER TABLE public.shift_employees
  DROP CONSTRAINT IF EXISTS shift_employees_organization_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS shift_employees_org_name_active_uniq
  ON public.shift_employees (organization_id, name)
  WHERE is_active;

INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('020', '020_shift_employees_partial_unique', now())
ON CONFLICT (version) DO NOTHING;
