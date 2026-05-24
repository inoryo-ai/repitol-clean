import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";
import {
  aggregateAllEmployees,
  normalizePythonExtractFull,
} from "@/lib/shift/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const STORE_CODE: Record<string, string> = {
  "shop_a": "shop_a",
  "shop_b": "shop_b",
  "Shop C": "shop_c",
};

// employees.json (簡易形式) の型
interface CompactStore {
  total_days?: number;
  n_早番?: number; n_中番?: number; n_変則?: number;
  preferred_days?: string[];
  preferred_time_band?: string;
  avg_slots_per_shift?: number;
  row_offset_hint?: number | null;
  default_weekly_days?: number;
  default_shift_length_slots?: number;
}
interface CompactEmployee {
  name: string;
  category?: "社員" | "混合" | "アルバイト";
  stores?: Record<string, CompactStore>;
}
interface CompactPayload {
  employees: CompactEmployee[];
}

function isCompactFormat(raw: unknown): raw is CompactPayload {
  return !!raw && typeof raw === "object"
    && Array.isArray((raw as CompactPayload).employees)
    && !("files" in (raw as object));
}

/**
 * POST /api/shift/employees/import
 *  multipart/form-data: file (.json from extract.py --all)
 *  → DB に従業員 + 店舗別履歴を upsert
 */
export async function POST(req: NextRequest) {
  const orgId = await getOrganizationId();
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const supabase = await createClient();
  let nUpserted = 0;
  let nStoreRows = 0;

  // === 形式A: 簡易形式 (employees.json) ===
  if (isCompactFormat(raw)) {
    for (const emp of raw.employees) {
      if (!emp.name) continue;
      const { data: row, error: e1 } = await supabase
        .from("shift_employees")
        .upsert(
          {
            organization_id: orgId,
            name: emp.name,
            category: emp.category ?? "アルバイト",
          },
          { onConflict: "organization_id,name" },
        )
        .select()
        .single();
      if (e1 || !row) continue;
      nUpserted += 1;
      for (const [storeName, st] of Object.entries(emp.stores ?? {})) {
        const code = STORE_CODE[storeName];
        if (!code) continue;
        const dws = st.default_weekly_days ?? 0;
        await supabase.from("shift_employee_stores").upsert(
          {
            employee_id: row.id,
            store_code: code,
            total_days: st.total_days ?? 0,
            n_haya: st.n_早番 ?? 0,
            n_naka: st.n_中番 ?? 0,
            n_henso: st.n_変則 ?? 0,
            preferred_days: st.preferred_days ?? [],
            preferred_time_band: st.preferred_time_band ?? "mixed",
            avg_slots_per_shift: st.avg_slots_per_shift ?? 16,
            row_offset_hint: st.row_offset_hint ?? null,
            default_enabled: dws > 0,
            default_weekly_days: dws,
            default_time_band: "auto",
            default_day_policy: "auto",
            default_allowed_days: [],
            default_excluded_days: [],
            default_shift_length_slots: st.default_shift_length_slots ?? 16,
          },
          { onConflict: "employee_id,store_code" },
        );
        nStoreRows += 1;
      }
    }
    return NextResponse.json({
      success: true, format: "compact",
      n_employees: nUpserted, n_store_rows: nStoreRows,
    });
  }

  // === 形式B: 完全 extract 形式 (extracted.json) ===
  const { extracts, categoriesByStore } = normalizePythonExtractFull(raw);
  const masters = aggregateAllEmployees(
    extracts.filter((e) => e.store && e.weeks.length > 0),
    categoriesByStore,
  );
  if (!masters.length) {
    return NextResponse.json({ error: "no employees found" }, { status: 400 });
  }

  for (const m of masters) {
    const { data: emp, error: e1 } = await supabase
      .from("shift_employees")
      .upsert(
        {
          organization_id: orgId,
          name: m.name,
          category: m.globalCategory,
        },
        { onConflict: "organization_id,name" },
      )
      .select()
      .single();
    if (e1 || !emp) continue;
    nUpserted += 1;
    for (const [storeName, prof] of Object.entries(m.perStore)) {
      const code = STORE_CODE[storeName];
      if (!code) continue;
      const cat = m.storeCategory[storeName];
      const totalDayCounts = Object.values(prof.dayOfWeekFreq).reduce((a, b) => a + b, 0);
      const dws = Math.max(0, Math.min(6, Math.round(
        totalDayCounts / Math.max(1, Math.round(prof.totalShifts / 3)),
      )));
      const length = Math.max(8, Math.min(20, Math.round(prof.avgSlotsPerShift)));
      await supabase.from("shift_employee_stores").upsert(
        {
          employee_id: emp.id,
          store_code: code,
          total_days: cat?.total_days ?? prof.totalShifts,
          n_haya: cat?.n_早番 ?? 0,
          n_naka: cat?.n_中番 ?? 0,
          n_henso: cat?.n_変則 ?? 0,
          preferred_days: prof.preferredDays,
          preferred_time_band: prof.preferredTimeBand,
          avg_slots_per_shift: prof.avgSlotsPerShift,
          row_offset_hint: prof.rowOffsetHint ?? null,
          default_enabled: dws > 0,
          default_weekly_days: dws,
          default_time_band: "auto",
          default_day_policy: "auto",
          default_allowed_days: [],
          default_excluded_days: [],
          default_shift_length_slots: length,
        },
        { onConflict: "employee_id,store_code" },
      );
      nStoreRows += 1;
    }
  }
  return NextResponse.json({
    success: true, format: "full_extract",
    n_employees: nUpserted, n_store_rows: nStoreRows,
  });
}
