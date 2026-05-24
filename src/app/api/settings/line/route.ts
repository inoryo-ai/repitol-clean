import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopId } from "@/lib/auth";

/**
 * S01修正: LINE秘密鍵をサーバー側で処理するAPIルート
 * ブラウザにはsecret/tokenの値を返さない
 */

// GET: 設定済みかどうかのステータスだけ返す（値は返さない）
export async function GET() {
  const shopId = await getShopId();
  if (!shopId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: shop } = await supabase
    .from("shops")
    .select("line_channel_id, line_channel_secret, line_channel_access_token")
    .eq("id", shopId)
    .single();

  return NextResponse.json({
    has_channel_id: !!shop?.line_channel_id,
    has_channel_secret: !!shop?.line_channel_secret,
    has_access_token: !!shop?.line_channel_access_token,
  });
}

// POST: LINE設定を更新
export async function POST(request: NextRequest) {
  const shopId = await getShopId();
  if (!shopId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { line_channel_id?: string; line_channel_secret?: string; line_channel_access_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // 空文字のフィールドは既存値を保持（上書きしない）
  const updateData: Record<string, string | null> = {};
  if (body.line_channel_id) updateData.line_channel_id = body.line_channel_id;
  if (body.line_channel_secret) updateData.line_channel_secret = body.line_channel_secret;
  if (body.line_channel_access_token) updateData.line_channel_access_token = body.line_channel_access_token;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("shops")
    .update(updateData)
    .eq("id", shopId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
