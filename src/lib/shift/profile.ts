/**
 * 従業員プロファイル算出 + シフト自動生成 (LLM-free heuristic).
 *
 * - aggregateProfiles(weeks): 各従業員の傾向を集計
 * - parseConstraintHint(text): 自然言語ヒントをルールに変換
 * - generateWeek(profiles, constraints, weekStart): 1週間分のシフトを自動生成
 *
 * 拡張ポイント: より高度な制約最適化が欲しくなれば NOUS-core (Python) を別の
 * Vercel Functions エンドポイントとして呼び出す形で接続予定。現状はシンプル
 * なヒューリスティック (頻度ベース選抜 + ルール除外) で動く。
 */

import type { DayBlock, EmployeeShift, ExtractResult, WeekSheet } from "./format";
import { allTimeSlots } from "./format";

const DAYS_OF_WEEK = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export interface EmployeeProfile {
  name: string;
  note: string;
  storeCounts: Record<string, number>;       // 店舗ごとの出現回数
  totalShifts: number;                         // 抽出期間中の総出勤日数
  totalSlots: number;                          // 30分スロット累計
  avgSlotsPerShift: number;                    // 平均勤務スロット (1日あたり)
  dayOfWeekFreq: Record<DayOfWeek, number>;   // 曜日別 出勤回数
  hourCounts: Record<number, number>;          // 0-23 時間帯別スロット数
  slotsByHour: Record<number, number>;         // alias of hourCounts
  preferredDays: DayOfWeek[];                  // 出勤頻度上位3日
  preferredTimeBand: "morning" | "lunch" | "evening" | "mixed";
  rowOffsetHint?: number;                      // 行配置ヒント (最頻row_offset)
}

function emptyDayFreq(): Record<DayOfWeek, number> {
  return { 月曜日: 0, 火曜日: 0, 水曜日: 0, 木曜日: 0, 金曜日: 0, 土曜日: 0, 日曜日: 0 };
}

function classifyTimeBand(hourCounts: Record<number, number>): "morning" | "lunch" | "evening" | "mixed" {
  let morning = 0, lunch = 0, evening = 0;
  for (const [h, n] of Object.entries(hourCounts)) {
    const hi = parseInt(h, 10);
    if (hi < 12) morning += n;
    else if (hi < 17) lunch += n;
    else evening += n;
  }
  const total = morning + lunch + evening;
  if (total === 0) return "mixed";
  const ratios = { morning: morning / total, lunch: lunch / total, evening: evening / total };
  const max = Math.max(ratios.morning, ratios.lunch, ratios.evening);
  if (max < 0.45) return "mixed";
  if (ratios.morning === max) return "morning";
  if (ratios.evening === max) return "evening";
  return "lunch";
}

export function aggregateProfiles(extracts: { store: string; weeks: WeekSheet[] }[]): EmployeeProfile[] {
  const map = new Map<string, EmployeeProfile>();
  // row_offset の最頻値カウント
  const rowOffsetMode: Record<string, Record<number, number>> = {};

  for (const e of extracts) {
    for (const w of e.weeks) {
      for (const d of w.days) {
        if (!DAYS_OF_WEEK.includes(d.dayLabel as DayOfWeek)) continue;
        for (const emp of d.employees) {
          if (!emp.name) continue;
          const key = emp.name;
          let p = map.get(key);
          if (!p) {
            p = {
              name: emp.name,
              note: emp.note,
              storeCounts: {},
              totalShifts: 0,
              totalSlots: 0,
              avgSlotsPerShift: 0,
              dayOfWeekFreq: emptyDayFreq(),
              hourCounts: {},
              slotsByHour: {},
              preferredDays: [],
              preferredTimeBand: "mixed",
            };
            map.set(key, p);
            rowOffsetMode[key] = {};
          }
          p.storeCounts[e.store] = (p.storeCounts[e.store] ?? 0) + 1;
          if (emp.slots.length > 0) p.totalShifts += 1;
          p.totalSlots += emp.slots.length;
          if (emp.slots.length > 0) {
            p.dayOfWeekFreq[d.dayLabel as DayOfWeek] += 1;
          }
          for (const slot of emp.slots) {
            const h = parseInt(slot.split(":")[0], 10);
            p.hourCounts[h] = (p.hourCounts[h] ?? 0) + 1;
          }
          if (emp.rowOffset && emp.rowOffset > 0) {
            rowOffsetMode[key][emp.rowOffset] = (rowOffsetMode[key][emp.rowOffset] ?? 0) + 1;
          }
        }
      }
    }
  }

  for (const p of map.values()) {
    p.slotsByHour = p.hourCounts;
    p.avgSlotsPerShift = p.totalShifts > 0 ? p.totalSlots / p.totalShifts : 0;
    p.preferredDays = (Object.entries(p.dayOfWeekFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k]) => k) as DayOfWeek[]);
    p.preferredTimeBand = classifyTimeBand(p.hourCounts);
    const om = rowOffsetMode[p.name];
    if (om && Object.keys(om).length) {
      const top = Object.entries(om).sort((a, b) => b[1] - a[1])[0];
      p.rowOffsetHint = parseInt(top[0], 10);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalShifts - a.totalShifts);
}

// ============ 制約 ============
export type TimeBandPref = "morning" | "lunch" | "evening" | "mixed" | "auto";
export type DayPolicy = "auto" | "weekday" | "weekend" | "all" | "specific";

export interface EmployeeConstraint {
  name: string;
  enabled: boolean;
  weeklyDays: number;            // 週何日入るか (0=出ない)
  timeBand: TimeBandPref;
  dayPolicy: DayPolicy;
  allowedDays: DayOfWeek[];      // dayPolicy=specific のとき有効
  excludedDays: DayOfWeek[];     // 除外したい曜日 (常に効く)
  shiftLengthSlots: number;      // 1シフトのスロット数 (default は profile から推定)
}

export interface GenerateOptions {
  weekStart: string;             // YYYY-MM-DD (月曜)
  storeName: string;
  baseSheetName: string;         // テンプレ内で書き込むシート名
  constraints: EmployeeConstraint[];
  hint?: string;                 // 任意の自然言語ヒント
}

// ============ 自然言語ヒント解析 ============
export interface ParsedHint {
  globalTimeBand?: TimeBandPref;
  globalExcludedDays: DayOfWeek[];
  globalIncludeOnly?: DayOfWeek[];
  perEmployee: Record<string, Partial<EmployeeConstraint>>;
}

const DAY_KEY: Record<string, DayOfWeek> = {
  月: "月曜日", 火: "火曜日", 水: "水曜日", 木: "木曜日",
  金: "金曜日", 土: "土曜日", 日: "日曜日",
  月曜: "月曜日", 火曜: "火曜日", 水曜: "水曜日", 木曜: "木曜日",
  金曜: "金曜日", 土曜: "土曜日", 日曜: "日曜日",
  月曜日: "月曜日", 火曜日: "火曜日", 水曜日: "水曜日", 木曜日: "木曜日",
  金曜日: "金曜日", 土曜日: "土曜日", 日曜日: "日曜日",
};

export function parseConstraintHint(text: string): ParsedHint {
  const hint: ParsedHint = { globalExcludedDays: [], perEmployee: {} };
  if (!text) return hint;
  const lines = text.split(/[\n。、,;]/g).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    // global time band
    if (/朝|午前|モーニング/.test(line)) hint.globalTimeBand = "morning";
    if (/昼|ランチ|お昼/.test(line)) hint.globalTimeBand = "lunch";
    if (/夜|夕|夜間|ディナー|閉店/.test(line)) hint.globalTimeBand = "evening";
    // 平日/週末
    if (/平日のみ|平日だけ/.test(line)) {
      hint.globalExcludedDays.push("土曜日", "日曜日");
    }
    if (/週末のみ|週末だけ/.test(line)) {
      hint.globalIncludeOnly = ["土曜日", "日曜日"];
    }
    // 「○曜は休み」「○曜日休み」
    const offMatch = line.match(/([月火水木金土日])(?:曜日?)?\s*(?:は|を|の)?\s*(?:休み|休|お休み|休む)/);
    if (offMatch) {
      const d = DAY_KEY[offMatch[1]];
      if (d) hint.globalExcludedDays.push(d);
    }
    // 「○○さんは週X日」
    const personDayMatch = line.match(/([^\s]+?)\s*(?:さん|先生)?\s*(?:は|を)?\s*週\s*(\d+)\s*日/);
    if (personDayMatch) {
      const name = personDayMatch[1];
      const days = parseInt(personDayMatch[2], 10);
      hint.perEmployee[name] = {
        ...(hint.perEmployee[name] ?? {}),
        weeklyDays: days,
      };
    }
    // 「○○さんは朝のみ」
    const personBandMatch = line.match(/([^\s]+?)\s*(?:さん|先生)?\s*(?:は|を)?\s*(朝|昼|夜|午前|夕方|モーニング|ランチ|ディナー)/);
    if (personBandMatch) {
      const name = personBandMatch[1];
      const word = personBandMatch[2];
      let band: TimeBandPref = "auto";
      if (/朝|午前|モーニング/.test(word)) band = "morning";
      else if (/昼|ランチ/.test(word)) band = "lunch";
      else if (/夜|夕|ディナー/.test(word)) band = "evening";
      hint.perEmployee[name] = {
        ...(hint.perEmployee[name] ?? {}),
        timeBand: band,
      };
    }
  }
  // dedupe excludedDays
  hint.globalExcludedDays = Array.from(new Set(hint.globalExcludedDays));
  return hint;
}

export function applyHintToConstraints(
  constraints: EmployeeConstraint[],
  hint: ParsedHint,
): EmployeeConstraint[] {
  return constraints.map((c) => {
    const override = hint.perEmployee[c.name];
    return {
      ...c,
      timeBand: override?.timeBand ?? (hint.globalTimeBand ?? c.timeBand),
      excludedDays: Array.from(new Set([...(c.excludedDays ?? []), ...hint.globalExcludedDays])),
      allowedDays: hint.globalIncludeOnly && c.dayPolicy === "auto"
        ? hint.globalIncludeOnly
        : c.allowedDays,
      dayPolicy: hint.globalIncludeOnly && c.dayPolicy === "auto" ? "specific" : c.dayPolicy,
      weeklyDays: override?.weeklyDays ?? c.weeklyDays,
    };
  });
}

// ============ 1週間生成 ============
function effectiveAllowedDays(c: EmployeeConstraint, profile?: EmployeeProfile): DayOfWeek[] {
  let pool: DayOfWeek[];
  switch (c.dayPolicy) {
    case "weekday":
      pool = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日"];
      break;
    case "weekend":
      pool = ["土曜日", "日曜日"];
      break;
    case "specific":
      pool = c.allowedDays.length ? c.allowedDays : DAYS_OF_WEEK.slice();
      break;
    case "all":
      pool = DAYS_OF_WEEK.slice();
      break;
    case "auto":
    default:
      pool = profile?.preferredDays?.length ? profile.preferredDays : DAYS_OF_WEEK.slice();
      break;
  }
  return pool.filter((d) => !c.excludedDays.includes(d));
}

function pickSlots(profile: EmployeeProfile | undefined, c: EmployeeConstraint): string[] {
  const slots = allTimeSlots();
  const len = c.shiftLengthSlots > 0 ? c.shiftLengthSlots : Math.max(8, Math.min(20, Math.round(profile?.avgSlotsPerShift ?? 12)));
  // band の中心時刻 → 連続スロットを返す
  const band = c.timeBand === "auto" ? (profile?.preferredTimeBand ?? "lunch") : c.timeBand;
  let centerHour = 13;
  if (band === "morning") centerHour = 11;
  else if (band === "evening") centerHour = 19;
  else if (band === "mixed") centerHour = 14;
  // start = centerHour - len*30/60/2
  const startTotalMin = centerHour * 60 - (len * 30) / 2;
  const startSlotIndex = Math.max(0, Math.round((startTotalMin - 10 * 60) / 30));
  const endSlotIndex = Math.min(slots.length - 1, startSlotIndex + len - 1);
  const out: string[] = [];
  for (let i = startSlotIndex; i <= endSlotIndex; i++) out.push(slots[i]);
  return out;
}

export interface GenerateResult {
  weekStart: string;
  store: string;
  sheetName: string;
  days: DayBlock[];
}

// ============ 横断 (3店舗合算) 集計 ============
/**
 * 1人の従業員について、店舗ごとの prof を保持する master record.
 */
export interface EmployeeStoreCategory {
  category: "社員" | "混合" | "アルバイト";
  total_days: number;
  n_早番: number;
  n_中番: number;
  n_変則: number;
  std_ratio: number;
}

export interface EmployeeMaster {
  name: string;
  perStore: Record<string, EmployeeProfile>; // 店舗名 -> profile
  storesWorked: string[];                     // 出勤実績ある店舗
  totalShifts: number;                        // 全店舗合算
  totalSlots: number;
  storeCategory: Record<string, EmployeeStoreCategory>; // 店舗別カテゴリ
  globalCategory: "社員" | "混合" | "アルバイト";        // 横断判定
}

/**
 * 抽出結果配列 (= [shop_a, Shop C, shop_b]) を受け取り、
 * 全従業員を名前単位でマージ。各従業員の店舗別 profile / category を保持。
 * extractsCategoryMap: 店舗 -> {名前 -> category info} (Pythonの employee_categories)
 */
export function aggregateAllEmployees(
  extracts: ExtractResult[],
  extractsCategoryMap?: Record<string, Record<string, EmployeeStoreCategory>>,
): EmployeeMaster[] {
  const map = new Map<string, EmployeeMaster>();
  for (const e of extracts) {
    const profs = aggregateProfiles([e]);
    const catMap = extractsCategoryMap?.[e.store] ?? {};
    for (const p of profs) {
      let m = map.get(p.name);
      if (!m) {
        m = {
          name: p.name,
          perStore: {},
          storesWorked: [],
          totalShifts: 0,
          totalSlots: 0,
          storeCategory: {},
          globalCategory: "アルバイト",
        };
        map.set(p.name, m);
      }
      m.perStore[e.store] = p;
      if (p.totalShifts > 0 && !m.storesWorked.includes(e.store)) {
        m.storesWorked.push(e.store);
      }
      m.totalShifts += p.totalShifts;
      m.totalSlots += p.totalSlots;
      const cat = catMap[p.name];
      if (cat) m.storeCategory[e.store] = cat;
    }
  }
  // global category: いずれかの店舗で 社員 ⇒ 社員 / どこも アルバイト ⇒ アルバイト / その他 混合
  for (const m of map.values()) {
    const cats = Object.values(m.storeCategory).map((c) => c.category);
    if (cats.includes("社員")) m.globalCategory = "社員";
    else if (cats.includes("混合")) m.globalCategory = "混合";
    else m.globalCategory = "アルバイト";
  }
  return Array.from(map.values())
    .sort((a, b) => {
      const order = { 社員: 0, 混合: 1, アルバイト: 2 };
      const oa = order[a.globalCategory], ob = order[b.globalCategory];
      if (oa !== ob) return oa - ob;
      return b.totalShifts - a.totalShifts;
    });
}

export interface ExtractedWithCategories {
  extracts: ExtractResult[];
  categoriesByStore: Record<string, Record<string, EmployeeStoreCategory>>;
}

/**
 * Python の extract.py 出力 (snake_case) を TS 用 (camelCase) に変換。
 * extracts 配列だけでなく employee_categories も合わせて返す。
 */
export function normalizePythonExtract(payload: unknown): ExtractResult[] {
  return normalizePythonExtractFull(payload).extracts;
}

export function normalizePythonExtractFull(payload: unknown): ExtractedWithCategories {
  type RawEmp = { name: string; note?: string; slots?: string[]; row_offset?: number;
                   shift_type?: string; shift_match?: number };
  type RawDay = { day_label?: string; date?: number; note?: string; employees?: RawEmp[] };
  type RawWeek = { sheet_name?: string; store?: string; year?: number | null;
                   month?: number | null; name_col?: number; days?: RawDay[] };
  type RawFile = { store?: string; weeks?: RawWeek[];
                    employee_categories?: Record<string, EmployeeStoreCategory> };
  type RawRoot = { files?: RawFile[] } | RawFile[];

  const root = payload as RawRoot;
  const filesArr: RawFile[] = Array.isArray(root)
    ? root
    : (root.files ?? []);

  // 名前として認めない値 (年月ヘッダ / 曜日ラベル / 単一記号)
  const dayLabels = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"];
  const reHeader = /令和\d+年\d+月/;
  const isInvalidName = (name: string) => {
    if (!name) return true;
    if (reHeader.test(name)) return true;
    if (dayLabels.some((d) => name.includes(d))) return true;
    if (name.length < 1) return true;
    return false;
  };

  const extracts = filesArr.map((f): ExtractResult => ({
    store: f.store ?? "",
    weeks: (f.weeks ?? []).map((w) => ({
      sheetName: w.sheet_name ?? "",
      store: w.store ?? f.store ?? "",
      year: w.year ?? null,
      month: w.month ?? null,
      nameCol: w.name_col ?? 2,
      days: (w.days ?? []).map((d) => ({
        dayLabel: d.day_label ?? "",
        date: d.date ?? null,
        note: d.note ?? "",
        employees: (d.employees ?? [])
          .filter((e) => !isInvalidName(e.name ?? ""))
          .map((e) => ({
            name: e.name ?? "",
            note: e.note ?? "",
            slots: e.slots ?? [],
            rowOffset: e.row_offset,
            shiftType: e.shift_type,
            shiftMatch: e.shift_match,
          })),
      })),
    })),
  }));
  const categoriesByStore: Record<string, Record<string, EmployeeStoreCategory>> = {};
  for (const f of filesArr) {
    if (f.store && f.employee_categories) {
      categoriesByStore[f.store] = f.employee_categories;
    }
  }
  return { extracts, categoriesByStore };
}

export function generateWeek(
  profiles: EmployeeProfile[],
  options: GenerateOptions,
): GenerateResult {
  const profByName = new Map(profiles.map((p) => [p.name, p]));
  const days: DayBlock[] = DAYS_OF_WEEK.map((d) => ({
    dayLabel: d,
    date: null,
    note: "",
    employees: [],
  }));

  // 各従業員ごとに weeklyDays 個の曜日を選んで割り当てる
  for (const c of options.constraints) {
    if (!c.enabled || c.weeklyDays <= 0) continue;
    const p = profByName.get(c.name);
    const allowed = effectiveAllowedDays(c, p);
    if (!allowed.length) continue;
    // 出勤頻度の高い曜日順 (profileから)
    const freq = p?.dayOfWeekFreq ?? emptyDayFreq();
    const ordered = allowed
      .slice()
      .sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0));
    const picks = ordered.slice(0, c.weeklyDays);
    const slots = pickSlots(p, c);
    for (const dl of picks) {
      const idx = DAYS_OF_WEEK.indexOf(dl);
      if (idx < 0) continue;
      const emp: EmployeeShift = {
        name: c.name,
        note: p?.note ?? "",
        slots: slots,
      };
      if (p?.rowOffsetHint) emp.rowOffset = p.rowOffsetHint;
      days[idx].employees.push(emp);
    }
  }

  // weekStart から日付埋め (YYYY-MM-DD 月曜)
  if (options.weekStart) {
    const ws = new Date(options.weekStart);
    if (!isNaN(ws.getTime())) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(ws);
        d.setDate(ws.getDate() + i);
        days[i].date = d.getDate();
      }
    }
  }

  return {
    weekStart: options.weekStart,
    store: options.storeName,
    sheetName: options.baseSheetName,
    days,
  };
}
