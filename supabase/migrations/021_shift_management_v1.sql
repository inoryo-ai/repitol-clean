-- =====================================================
-- 021: シフト管理 v1 — 計画・希望・実績・給与の統合
-- 既存 shift_employees / shift_employee_stores はそのまま使用、
-- 新たに必要人員 / 希望 / 計画 / 配置 / 実績 / 給与期間 を追加。
-- =====================================================

-- 雇用情報を従業員マスタに追加
ALTER TABLE public.shift_employees
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'アルバイト';
  -- '社員' / 'アルバイト' / 'パート'
ALTER TABLE public.shift_employees
  ADD COLUMN IF NOT EXISTS hourly_wage INTEGER NOT NULL DEFAULT 1200; -- 円/時
ALTER TABLE public.shift_employees
  ADD COLUMN IF NOT EXISTS monthly_salary INTEGER; -- 円/月 (社員のみ)

-- 必要人員 (曜日×時間帯, 店舗ごとの基準)
CREATE TABLE IF NOT EXISTS public.shift_required_staffing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_code TEXT NOT NULL,                      -- 'shop_a' / 'shop_b' / 'shop_c'
  day_of_week INTEGER NOT NULL,                  -- 0=日, 1=月, ..., 6=土
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  required_count INTEGER NOT NULL DEFAULT 1,
  role TEXT,                                     -- ホール/キッチン (任意)
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_req_org_store
  ON public.shift_required_staffing(organization_id, store_code);

-- 希望シフト (管理者が紙/口頭から入力)
CREATE TABLE IF NOT EXISTS public.shift_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.shift_employees(id) ON DELETE CASCADE,
  store_code TEXT,                                -- 任意 (店舗指定希望のとき)
  date DATE NOT NULL,
  request_type TEXT NOT NULL,
  -- '出勤希望' / '休み希望' / '出勤可' / '出勤不可'
  start_time TIME,                                -- 出勤希望のときの希望時間帯
  end_time TIME,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, date)
);
CREATE INDEX IF NOT EXISTS idx_shift_req_org_date
  ON public.shift_requests(organization_id, date);

-- シフト計画 (1週間 × 1店舗 単位)
CREATE TABLE IF NOT EXISTS public.shift_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  store_code TEXT NOT NULL,
  week_start DATE NOT NULL,                       -- 月曜日
  status TEXT NOT NULL DEFAULT 'draft',           -- 'draft' / 'published' / 'locked'
  published_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, store_code, week_start)
);
CREATE INDEX IF NOT EXISTS idx_shift_plans_org
  ON public.shift_plans(organization_id, week_start);

-- シフト配置 (個々の人 × 日 × 時間帯)
CREATE TABLE IF NOT EXISTS public.shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.shift_plans(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.shift_employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  role TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_plan
  ON public.shift_assignments(plan_id);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_emp_date
  ON public.shift_assignments(employee_id, date);

-- 実績 (紙の打刻表から転記)
CREATE TABLE IF NOT EXISTS public.shift_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.shift_employees(id) ON DELETE CASCADE,
  store_code TEXT NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',         -- 'manual' / 'imported'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_time_emp_date
  ON public.shift_time_entries(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_shift_time_org_month
  ON public.shift_time_entries(organization_id, date);

-- 月次給与期間
CREATE TABLE IF NOT EXISTS public.shift_payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.shift_employees(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,                       -- 'YYYY-MM'
  total_minutes INTEGER NOT NULL DEFAULT 0,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  paid_minutes INTEGER NOT NULL DEFAULT 0,
  base_pay INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_pay INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',           -- draft / confirmed
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, employee_id, year_month)
);
CREATE INDEX IF NOT EXISTS idx_payroll_org_month
  ON public.shift_payroll_periods(organization_id, year_month);

INSERT INTO public.schema_migrations (version, name, applied_at)
VALUES ('021', '021_shift_management_v1', now())
ON CONFLICT (version) DO NOTHING;
