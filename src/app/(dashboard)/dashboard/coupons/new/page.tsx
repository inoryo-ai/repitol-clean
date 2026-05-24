"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/image-uploader";

export default function NewCouponPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const body = {
      title: form.get("title") as string,
      description: form.get("description") as string,
      coupon_type: form.get("coupon_type") as string,
      discount_value: form.get("discount_value")
        ? Number(form.get("discount_value"))
        : null,
      valid_days: Number(form.get("valid_days")),
      image_url: imageUrl,
    };

    const res = await fetch("/api/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "作成に失敗しました");
      setLoading(false);
      return;
    }

    router.push("/dashboard/coupons");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/coupons"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; クーポン一覧
        </Link>
        <h1 className="text-2xl font-bold">クーポン新規作成</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">テンプレート情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                タイトル <span className="text-destructive">*</span>
              </label>
              <Input name="title" required placeholder="例: 初回来店10%OFF" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">説明</label>
              <textarea
                name="description"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="クーポンの説明文"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                種別 <span className="text-destructive">*</span>
              </label>
              <select
                name="coupon_type"
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="discount_percent">割引（%）</option>
                <option value="discount_yen">割引（円）</option>
                <option value="free_item">無料提供</option>
                <option value="custom">カスタム</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">割引値</label>
              <Input
                name="discount_value"
                type="number"
                min={0}
                placeholder="例: 10（%の場合）/ 500（円の場合）"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                有効日数 <span className="text-destructive">*</span>
              </label>
              <Input
                name="valid_days"
                type="number"
                min={1}
                required
                defaultValue={30}
                placeholder="30"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">画像（任意）</label>
              <ImageUploader
                value={imageUrl}
                onChange={setImageUrl}
                folder="coupons"
                allowManualUrl
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "作成中..." : "作成する"}
              </Button>
              <Link
                href="/dashboard/coupons"
                className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
              >
                キャンセル
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
