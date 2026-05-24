-- =====================================================
-- 019: シフト管理用 従業員マスタ
-- demo系列 (3店舗) の従業員を組織単位で永続管理し、
-- シフト作成時には DB から従業員を読み込む。
-- =====================================================

CREATE TABLE IF NOT EXISTS public.shift_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                                -- 従業員名 (組織内ユニーク)
  kana TEXT,                                         -- ふりがな (任意)
  category TEXT NOT NULL DEFAULT 'アルバイト',       -- '社員' / '混合' / 'アルバイト'
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_shift_employees_org
  ON public.shift_employees(organization_id);

-- 各従業員 × 各店舗の集計 + 既定制約
CREATE TABLE IF NOT EXISTS public.shift_employee_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.shift_employees(id) ON DELETE CASCADE,
  store_code TEXT NOT NULL,                          -- 'shop_a' / 'shop_b' / 'shop_c'
  -- 履歴集計 (JSON取込時に記録)
  total_days INTEGER NOT NULL DEFAULT 0,
  n_haya INTEGER NOT NULL DEFAULT 0,                 -- 早番回数
  n_naka INTEGER NOT NULL DEFAULT 0,                 -- 中番回数
  n_henso INTEGER NOT NULL DEFAULT 0,                -- 変則回数
  preferred_days TEXT[] NOT NULL DEFAULT '{}',
  preferred_time_band TEXT NOT NULL DEFAULT 'mixed',
  avg_slots_per_shift NUMERIC NOT NULL DEFAULT 16,
  row_offset_hint INTEGER,
  -- 既定制約 (シフト作成画面の初期値, 編集すると保存)
  default_enabled BOOLEAN NOT NULL DEFAULT true,
  default_weekly_days INTEGER NOT NULL DEFAULT 0,
  default_time_band TEXT NOT NULL DEFAULT 'auto',
  default_day_policy TEXT NOT NULL DEFAULT 'auto',
  default_allowed_days TEXT[] NOT NULL DEFAULT '{}',
  default_excluded_days TEXT[] NOT NULL DEFAULT '{}',
  default_shift_length_slots INTEGER NOT NULL DEFAULT 16,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, store_code)
);

CREATE INDEX IF NOT EXISTS idx_shift_emp_stores_employee
  ON public.shift_employee_stores(employee_id);

-- 履歴
INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('019', '019_shift_employees', now())
ON CONFLICT (version) DO NOTHING;
