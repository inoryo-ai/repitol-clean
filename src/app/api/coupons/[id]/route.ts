import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrganizationId } from "@/lib/auth";
import { z } from "zod";

const updateCouponSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  coupon_type: z.enum(["discount_percent", "discount_yen", "free_item", "custom"]).optional(),
  discount_value: z.number().int().min(0).nullable().optional(),
  valid_days: z.number().int().min(1).optional(),
  image_url: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const organizationId = await getOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = updateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupon_templates")
    .update(parsed.data)
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const organizationId = await getOrganizationId();
  if (!organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const mode = request.nextUrl.searchParams.get("mode") ?? "soft";
  const supabase = await createClient();

  if (mode === "hard") {
    // 発行履歴があるかチェック
    const { count } = await supabase
      .from("coupons_issued")
      .select("*", { count: "exact", head: true })
      .eq("template_id", id);
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "このクーポンは既に発行履歴があるため完全削除できません。無効化のみ可能です。" },
        { status: 409 }
      );
    }
    // スタンプカードから参照されていないかチェック
    const { count: cardRefCount } = await supabase
      .from("stamp_cards")
      .select("*", { count: "exact", head: true })
      .or(`mid_reward_coupon_template_id.eq.${id},reward_coupon_template_id.eq.${id}`);
    if ((cardRefCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "スタンプカードから参照されているため完全削除できません。先に参照を外してください。" },
        { status: 409 }
      );
    }
    // クーポングループ参照
    const { count: groupRefCount } = await supabase
      .from("coupon_group_templates")
      .select("*", { count: "exact", head: true })
      .eq("template_id", id);
    if ((groupRefCount ?? 0) > 0) {
      return NextResponse.json(
        { error: "クーポングループから参照されているため完全削除できません。" },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("coupon_templates")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, mode: "hard" });
  }

  // soft delete: is_active=false
  const { error } = await supabase
    .from("coupon_templates")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, mode: "soft" });
}
