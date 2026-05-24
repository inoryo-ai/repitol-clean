import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getShopId, getOrganizationId } from "@/lib/auth";
import { z } from "zod";

const createCouponSchema = z.object({
  title: z.string().min(1, "タイトルは必須です"),
  description: z.string().default(""),
  coupon_type: z.enum(["discount_percent", "discount_yen", "free_item", "custom"]),
  discount_value: z.number().int().min(0).nullable().default(null),
  valid_days: z.number().int().min(1, "有効日数は1以上"),
  image_url: z.string().url().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const shopId = await getShopId();
  const organizationId = await getOrganizationId();
  if (!shopId || !organizationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { title, description, coupon_type, discount_value, valid_days, image_url } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("coupon_templates")
    .insert({
      shop_id: shopId,
      organization_id: organizationId,
      title,
      description,
      coupon_type,
      discount_value,
      valid_days,
      image_url: image_url ?? null,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}
