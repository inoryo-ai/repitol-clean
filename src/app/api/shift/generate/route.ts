import { NextRequest, NextResponse } from "next/server";
import { generateFromTemplate, type ExtractResult } from "@/lib/shift/format";
import {
  generateWeek,
  parseConstraintHint,
  applyHintToConstraints,
  type EmployeeProfile,
  type GenerateOptions,
} from "@/lib/shift/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/shift/generate
 *  multipart/form-data:
 *    template:  .xlsx (テンプレートファイル)
 *    payload:   JSON string {
 *                 profiles: EmployeeProfile[],
 *                 options:  GenerateOptions,
 *                 hint?:    string,
 *               }
 *  → xlsx (binary, attachment)
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const template = form.get("template");
    const payloadRaw = String(form.get("payload") ?? "");
    if (!(template instanceof File)) {
      return NextResponse.json({ error: "template (xlsx) is required" }, { status: 400 });
    }
    if (!payloadRaw) {
      return NextResponse.json({ error: "payload (json) is required" }, { status: 400 });
    }
    const payload = JSON.parse(payloadRaw) as {
      profiles: EmployeeProfile[];
      options: GenerateOptions;
      hint?: string;
    };
    let constraints = payload.options.constraints ?? [];
    if (payload.hint) {
      const parsed = parseConstraintHint(payload.hint);
      constraints = applyHintToConstraints(constraints, parsed);
    }
    const opts: GenerateOptions = { ...payload.options, constraints };
    const week = generateWeek(payload.profiles ?? [], opts);

    // テンプレに書き戻し
    const tplBuf = await template.arrayBuffer();
    // ExtractResult 形に詰めて 1シートだけ書く
    const extract: ExtractResult = {
      store: opts.storeName,
      weeks: [
        {
          sheetName: opts.baseSheetName,
          store: opts.storeName,
          year: null,
          month: null,
          nameCol: 2,
          days: week.days,
        },
      ],
    };
    const out = await generateFromTemplate(tplBuf, extract);
    // Buffer → 安全に ArrayBuffer に複製してから返す
    const ab = new ArrayBuffer(out.byteLength);
    new Uint8Array(ab).set(out);
    return new NextResponse(ab, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="shift_${opts.weekStart}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `generate failed: ${msg}` }, { status: 500 });
  }
}
