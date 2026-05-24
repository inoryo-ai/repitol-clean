import { NextRequest, NextResponse } from "next/server";
import { extractFromBuffer } from "@/lib/shift/format";
import { aggregateProfiles } from "@/lib/shift/profile";

export const runtime = "nodejs";   // exceljs は nodejs 必須
export const maxDuration = 60;

/**
 * POST /api/shift/extract
 *  multipart/form-data: file (.xlsx), store (string)
 * → { extract, profiles }
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const store = String(form.get("store") ?? "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const buf = await file.arrayBuffer();
  try {
    const extract = await extractFromBuffer(buf, store);
    const profiles = aggregateProfiles([extract]);
    return NextResponse.json({ extract, profiles });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `extract failed: ${msg}` }, { status: 500 });
  }
}
