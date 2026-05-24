"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";

interface Template {
  id: string;
  title: string;
  description: string;
  coupon_type: "discount_percent" | "discount_yen" | "free_item" | "custom";
  discount_value: number | null;
  valid_days: number;
  image_url: string | null;
  is_active: boolean;
  created_at?: string;
}

const TYPE_LABEL: Record<Template["coupon_type"], string> = {
  discount_percent: "割引（%）",
  discount_yen: "割引（円）",
  free_item: "無料提供",
  custom: "カスタム",
};

function formatDiscount(t: Pick<Template, "coupon_type" | "discount_value">) {
  if (t.discount_value == null) return null;
  if (t.coupon_type === "discount_percent") return `${t.discount_value}%OFF`;
  if (t.coupon_type === "discount_yen") return `${t.discount_value}円OFF`;
  return `${t.discount_value}`;
}

export default function CouponEditPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [tpl, setTpl] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error: dbError } = await supabase
        .from("coupon_templates")
        .select("id, title, description, coupon_type, discount_value, valid_days, image_url, is_active, created_at")
        .eq("id", id)
        .single();
      if (dbError) {
        console.error("[coupon detail] load error:", dbError);
        setError(`読み込み失敗: ${dbError.message}`);
      } else if (data) {
        setTpl(data as Template);
      }
      setLoading(false);
    }
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!tpl) return;
    setSaving(true);
    setError("");
    setMessage("");

    const res = await fetch(`/api/coupons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: tpl.title,
        description: tpl.description,
        coupon_type: tpl.coupon_type,
        discount_value: tpl.discount_value,
        valid_days: tpl.valid_days,
        image_url: tpl.image_url || null,
        is_active: tpl.is_active,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "保存失敗");
      setSaving(false);
      return;
    }
    setMessage("保存しました");
    setSaving(false);
  }

  async function softDelete() {
    if (!confirm("このクーポンを無効化しますか？発行済みクーポンは残ります。")) return;
    const res = await fetch(`/api/coupons/${id}?mode=soft`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/coupons");
    else { const d = await res.json(); setError(d.error ?? "無効化失敗"); }
  }

  async function hardDelete() {
    if (!confirm("このクーポンを完全削除しますか？\n\n発行履歴・スタンプカードから参照されている場合は削除できません。")) return;
    const res = await fetch(`/api/coupons/${id}?mode=hard`, { method: "DELETE" });
    if (res.ok) {
      router.push("/dashboard/coupons");
    } else {
      const d = await res.json();
      setError(d.error ?? "完全削除失敗");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">読み込み中...</p>;
  if (!tpl) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">クーポンが見つかりません</p>
        {error && <p className="text-xs text-muted-foreground">{error}</p>}
        <Link href="/dashboard/coupons" className="text-sm text-primary hover:underline">
          &larr; 一覧に戻る
        </Link>
      </div>
    );
  }

  const discountLabel = formatDiscount(tpl);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/coupons" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; クーポン一覧
        </Link>
        <h1 className="text-2xl font-bold">クーポン詳細</h1>
      </div>

      {/* === 詳細サマリ === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">詳細</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-shrink-0">
              {tpl.image_url ? (
                <Image
                  src={tpl.image_url}
                  alt={tpl.title}
                  width={200}
                  height={200}
                  unoptimized
                  className="h-48 w-48 rounded-md border object-contain bg-muted"
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                  画像なし
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 flex-1 min-w-0">
              <div>
                <h2 className="text-xl font-bold break-words">{tpl.title}</h2>
                {tpl.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {tpl.description}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{TYPE_LABEL[tpl.coupon_type]}</Badge>
                {discountLabel && (
                  <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                    {discountLabel}
                  </Badge>
                )}
                <Badge variant="outline">有効期間 {tpl.valid_days}日</Badge>
                <Badge variant={tpl.is_active ? "default" : "secondary"}>
                  {tpl.is_active ? "有効" : "無効"}
                </Badge>
              </div>
              {tpl.created_at && (
                <p className="text-xs text-muted-foreground">
                  作成: {new Date(tpl.created_at).toLocaleString("ja-JP")}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* === 編集フォーム === */}
      <Card>
        <CardHeader><CardTitle className="text-lg">編集内容</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">タイトル</label>
              <Input value={tpl.title} onChange={e => setTpl({ ...tpl, title: e.target.value })} required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">説明</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={tpl.description}
                onChange={e => setTpl({ ...tpl, description: e.target.value })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">種別</label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={tpl.coupon_type}
                onChange={e => setTpl({ ...tpl, coupon_type: e.target.value as Template["coupon_type"] })}
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
                type="number"
                min={0}
                value={tpl.discount_value ?? ""}
                onChange={e => setTpl({ ...tpl, discount_value: e.target.value ? Number(e.target.value) : null })}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">有効日数</label>
              <Input
                type="number"
                min={1}
                value={tpl.valid_days}
                onChange={e => setTpl({ ...tpl, valid_days: Number(e.target.value) })}
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">画像</label>
              <ImageUploader
                value={tpl.image_url}
                onChange={(url) => setTpl({ ...tpl, image_url: url })}
                folder="coupons"
                allowManualUrl
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={tpl.is_active}
                onChange={e => setTpl({ ...tpl, is_active: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="is_active" className="text-sm">有効にする</label>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "保存中..." : "保存する"}
              </Button>
              <Button type="button" variant="outline" onClick={softDelete}>
                無効化
              </Button>
              <Button type="button" variant="destructive" onClick={hardDelete}>
                完全削除
              </Button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ・<strong>無効化</strong>: 一覧から非表示（発行済みクーポンは残る・取り消し不可）<br />
              ・<strong>完全削除</strong>: DBから削除（発行履歴やスタンプカード参照がない場合のみ可能）
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
