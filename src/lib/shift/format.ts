/**
 * demo系列シフト Excel フォーマット定義 (TypeScript port).
 *
 * Python 版 (`projects/shift-tool/shift_format.py`) のロジックを Next.js 内で
 * 動かすための移植。store差(名前列1 or 2)・マージセル・row_offset を保持する。
 */

import ExcelJS from "exceljs";

// ------------ 定数 ------------
export const TIME_START_HOUR = 10;
export const TIME_START_MIN = 0;
export const COL_TIME_START = 3;
export const COL_TIME_END = 31;
/** 1日ブロック全体の行数 (次の曜日ラベルまでの間隔) */
export const DAY_BLOCK_ROWS = 22;
/**
 * 1日ブロック内で「従業員行」として使える最大オフセット.
 * 22行のうち、末尾3行は次の日のヘッダ (date / 空白 / 曜日ラベル) のため
 * 上書きしてはならない. → dow_row+1 .. dow_row+EMPLOYEE_OFFSET_MAX を employee 行とする.
 */
export const EMPLOYEE_OFFSET_MAX = 19;
/** Excelで「30分」を表す numeric (= 1日 = 1.0 → 30分 = 30/1440) */
export const TIME_30MIN = 30 / 1440;

const DAY_LABELS = ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"] as const;
export type DayLabel = (typeof DAY_LABELS)[number];

// ------------ 時刻⇔列 ------------
export function colToTime(col: number): string {
  if (col < COL_TIME_START || col > COL_TIME_END) return "";
  const offset = col - COL_TIME_START;
  const total = TIME_START_HOUR * 60 + TIME_START_MIN + offset * 30;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToCol(t: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return -1;
  const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const base = TIME_START_HOUR * 60 + TIME_START_MIN;
  const diff = total - base;
  if (diff < 0 || diff % 30 !== 0) return -1;
  const col = COL_TIME_START + diff / 30;
  return col > COL_TIME_END ? -1 : col;
}

export function allTimeSlots(): string[] {
  const out: string[] = [];
  for (let c = COL_TIME_START; c <= COL_TIME_END; c++) out.push(colToTime(c));
  return out;
}

// ------------ 型 ------------
export interface EmployeeShift {
  name: string;
  note: string;
  slots: string[];
  rowOffset?: number;
  shiftType?: string;        // "早番" / "中番" / "変則" / "不在"
  shiftMatch?: number;       // Jaccard score
}

export interface DayBlock {
  dayLabel: string;
  date: number | null;
  note: string;
  employees: EmployeeShift[];
}

export interface WeekSheet {
  sheetName: string;
  store: string;
  year: number | null;
  month: number | null;
  nameCol: number;
  days: DayBlock[];
}

export interface ExtractResult {
  store: string;
  weeks: WeekSheet[];
}

// ------------ "filled" 判定 ------------
function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return false;
    if (/^\d+:\d{2}(:\d{2})?$/.test(s)) return true;
    return false;
  }
  if (typeof v === "number") {
    // ExcelJS time → 数値 (1日=1.0). 0より大なら勤務扱い
    return v > 0;
  }
  if (v instanceof Date) return true;
  if (typeof v === "object" && v !== null) {
    // ExcelJS は cell.value が { result, formula } の形のことがある
    type ExcelObj = { result?: unknown; text?: unknown };
    const obj = v as ExcelObj;
    if (obj.result !== undefined) return isFilled(obj.result);
    if (obj.text !== undefined) return isFilled(obj.text);
  }
  return false;
}

// ------------ パース ------------
function detectYearMonth(ws: ExcelJS.Worksheet): { year: number | null; month: number | null } {
  for (let r = 1; r <= 8; r++) {
    for (let c = 1; c <= 12; c++) {
      const v = ws.getCell(r, c).value;
      if (typeof v === "string") {
        const m = /令和(\d+)年(\d+)月/.exec(v);
        if (m) {
          const reiwa = parseInt(m[1], 10);
          return { year: 2018 + reiwa, month: parseInt(m[2], 10) };
        }
      }
    }
  }
  return { year: null, month: null };
}

function findDayBlocks(ws: ExcelJS.Worksheet): { rows: number[]; nameCol: number } {
  for (const nameCol of [1, 2]) {
    const rows: number[] = [];
    const max = Math.min(ws.rowCount, 250);
    for (let r = 1; r <= max; r++) {
      const v = ws.getCell(r, nameCol).value;
      if (typeof v === "string" && DAY_LABELS.some((d) => v.includes(d))) {
        rows.push(r);
      }
    }
    if (rows.length > 0) return { rows, nameCol };
  }
  return { rows: [], nameCol: 2 };
}

function extractDate(ws: ExcelJS.Worksheet, dowRow: number): number | null {
  for (const r of [dowRow - 1, dowRow - 2]) {
    if (r < 1) continue;
    const max = ws.columnCount;
    for (let c = 1; c <= max; c++) {
      const v = ws.getCell(r, c).value;
      if (v == null) continue;
      const s = String(v).trim();
      if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        if (n >= 1 && n <= 31) return n;
      }
    }
  }
  return null;
}

function parseDayBlock(ws: ExcelJS.Worksheet, dowRow: number, nameCol: number): DayBlock {
  const rawLabelRaw = ws.getCell(dowRow, nameCol).value;
  const rawLabel = typeof rawLabelRaw === "string" ? rawLabelRaw.trim() : String(rawLabelRaw ?? "").trim();
  let dayLabel = "";
  let note = "";
  for (const d of DAY_LABELS) {
    if (rawLabel.includes(d)) {
      dayLabel = d;
      note = rawLabel.replace(d, "").replace(/[（）()  ]/g, "").trim();
      break;
    }
  }
  if (!dayLabel) dayLabel = rawLabel;
  const date = extractDate(ws, dowRow);
  const block: DayBlock = { dayLabel, date, note, employees: [] };

  // 従業員行のみ走査. ヘッダ行 (年月ラベル / 日付 / 曜日) を除外するため
  // EMPLOYEE_OFFSET_MAX で打切り、また「令和X年Y月」「曜日」を含む値は
  // 従業員名として採用しない.
  const endRow = Math.min(dowRow + EMPLOYEE_OFFSET_MAX, ws.rowCount);
  for (let r = dowRow + 1; r <= endRow; r++) {
    const nv = ws.getCell(r, nameCol).value;
    if (nv == null) continue;
    const nameStr = String(nv).trim();
    if (!nameStr) continue;
    // ヘッダ系の文字列を除外
    if (/令和\d+年\d+月/.test(nameStr)) continue;
    if (DAY_LABELS.some((d) => nameStr.includes(d))) continue;
    const m = /^([^\s\d]+)(.*)$/.exec(nameStr);
    let baseName = nameStr;
    let empNote = "";
    if (m) {
      baseName = m[1].trim();
      empNote = m[2].trim();
    }
    const emp: EmployeeShift = {
      name: baseName,
      note: empNote,
      slots: [],
      rowOffset: r - dowRow,
    };
    for (let c = COL_TIME_START; c <= COL_TIME_END; c++) {
      const v = ws.getCell(r, c).value;
      if (isFilled(v)) emp.slots.push(colToTime(c));
    }
    block.employees.push(emp);
  }
  return block;
}

export function parseSheet(ws: ExcelJS.Worksheet, store: string): WeekSheet {
  const ym = detectYearMonth(ws);
  const { rows, nameCol } = findDayBlocks(ws);
  const days: DayBlock[] = [];
  for (const dowRow of rows) {
    try {
      const d = parseDayBlock(ws, dowRow, nameCol);
      if (d.dayLabel) days.push(d);
    } catch {
      /* skip bad blocks */
    }
  }
  return {
    sheetName: ws.name,
    store,
    year: ym.year,
    month: ym.month,
    nameCol,
    days,
  };
}

export async function extractFromBuffer(buf: ArrayBuffer | Uint8Array, store: string): Promise<ExtractResult> {
  const wb = new ExcelJS.Workbook();
  // exceljs は ArrayBuffer / Buffer どちらでも load 可。型安全に渡すため
  // ArrayBuffer に正規化する。
  const ab: ArrayBuffer = buf instanceof ArrayBuffer
    ? buf
    : (() => {
        const out = new ArrayBuffer(buf.byteLength);
        new Uint8Array(out).set(buf);
        return out;
      })();
  await wb.xlsx.load(ab);
  const weeks: WeekSheet[] = [];
  wb.eachSheet((ws) => {
    const w = parseSheet(ws, store);
    if (w.days.length > 0) weeks.push(w);
  });
  return { store, weeks };
}

// ------------ 書き戻し (テンプレートに上書き) ------------
function isMergedAddr(ws: ExcelJS.Worksheet, address: string): boolean {
  // ExcelJS: ws.getCell(row, col) の master が異なるものは merge内
  // 単純判定: cell の type が Merge
  // ExcelJS には isMerged() がないので、_merges を使う
  type WsWithMerges = ExcelJS.Worksheet & { _merges?: Record<string, unknown> };
  const merges = (ws as WsWithMerges)._merges;
  if (!merges) return false;
  for (const range of Object.values(merges)) {
    type MergeRange = { tl?: { address?: string }; model?: { range?: { startRow?: number; endRow?: number; startCol?: number; endCol?: number } } };
    const mr = range as MergeRange;
    const tlAddr = mr.tl?.address;
    if (tlAddr && tlAddr === address) return false; // master cell is writable
    const modelRange = mr.model?.range;
    if (
      modelRange &&
      modelRange.startRow !== undefined &&
      modelRange.endRow !== undefined &&
      modelRange.startCol !== undefined &&
      modelRange.endCol !== undefined
    ) {
      // resolve our address to row/col, naive: skip
    }
  }
  return false;
}

function safeSet(ws: ExcelJS.Worksheet, r: number, c: number, value: ExcelJS.CellValue): boolean {
  const cell = ws.getCell(r, c);
  // master セル以外には書き込めない
  if (cell.master !== cell) {
    return false;
  }
  cell.value = value;
  return true;
}

function clearDayBlock(ws: ExcelJS.Worksheet, dowRow: number, nameCol: number): void {
  // 従業員行のみクリア (翌日ヘッダ行を破壊しないよう EMPLOYEE_OFFSET_MAX で打切)
  const endRow = Math.min(dowRow + EMPLOYEE_OFFSET_MAX, ws.rowCount);
  for (let r = dowRow + 1; r <= endRow; r++) {
    safeSet(ws, r, nameCol, null);
    for (let c = COL_TIME_START; c <= COL_TIME_END; c++) {
      safeSet(ws, r, c, null);
    }
  }
}

function writableRows(ws: ExcelJS.Worksheet, dowRow: number, nameCol: number): number[] {
  // 従業員行のみ (翌日ヘッダ行を含めない)
  const endRow = Math.min(dowRow + EMPLOYEE_OFFSET_MAX, ws.rowCount);
  const out: number[] = [];
  for (let r = dowRow + 1; r <= endRow; r++) {
    const cell = ws.getCell(r, nameCol);
    if (cell.master === cell) out.push(r);
  }
  return out;
}

function writeDayBlock(ws: ExcelJS.Worksheet, dowRow: number, day: DayBlock, nameCol: number): void {
  // 従業員行のみが書込対象 (翌日ヘッダを越えない)
  const endRow = Math.min(dowRow + EMPLOYEE_OFFSET_MAX, ws.rowCount);
  const used = new Set<number>();
  // pass1: rowOffset 指定組
  for (const emp of day.employees) {
    if (!emp.rowOffset || emp.rowOffset <= 0) continue;
    const r = dowRow + emp.rowOffset;
    if (r > endRow) continue;
    const nm = emp.name + (emp.note || "");
    if (!safeSet(ws, r, nameCol, nm)) continue;
    used.add(r);
    for (const slot of emp.slots) {
      const c = timeToCol(slot);
      if (c >= 0) safeSet(ws, r, c, TIME_30MIN);  // numeric time (SUM対応)
    }
  }
  // pass2: row指定なし → 空き行に詰める
  const free = writableRows(ws, dowRow, nameCol).filter((r) => !used.has(r));
  let i = 0;
  for (const emp of day.employees) {
    if (emp.rowOffset && emp.rowOffset > 0) continue;
    if (i >= free.length) break;
    const r = free[i++];
    const nm = emp.name + (emp.note || "");
    if (!safeSet(ws, r, nameCol, nm)) continue;
    for (const slot of emp.slots) {
      const c = timeToCol(slot);
      if (c >= 0) safeSet(ws, r, c, TIME_30MIN);
    }
  }
}

export async function generateFromTemplate(templateBuf: ArrayBuffer | Uint8Array, data: ExtractResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ab: ArrayBuffer = templateBuf instanceof ArrayBuffer
    ? templateBuf
    : (() => {
        const out = new ArrayBuffer(templateBuf.byteLength);
        new Uint8Array(out).set(templateBuf);
        return out;
      })();
  await wb.xlsx.load(ab);
  for (const week of data.weeks) {
    const ws = wb.getWorksheet(week.sheetName);
    if (!ws) continue;
    const { rows, nameCol } = findDayBlocks(ws);
    for (let i = 0; i < rows.length; i++) {
      const dowRow = rows[i];
      const day = week.days[i];
      clearDayBlock(ws, dowRow, nameCol);
      if (day) writeDayBlock(ws, dowRow, day, nameCol);
    }
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

// suppress unused export warning until used
export const _unused_isMergedAddr = isMergedAddr;
