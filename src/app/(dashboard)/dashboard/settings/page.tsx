"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import type { Shop } from "@/lib/types/database";

export default function SettingsPage() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [message, setMessage] = useState("");
  const [lineStatus, setLineStatus] = useState({
    has_channel_id: false,
    has_channel_secret: false,
    has_access_token: false,
  });
  // UI05修正: keyを使って再マウントさせる
  const [formKey, setFormKey] = useState(0);

  const supabase = createClient();

  // 初期データ取得（useEffect内でインライン実行）
  useEffect(() => {
    async function fetchShop() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .single();

      if (!profile?.shop_id) return;

      const { data } = await supabase
        .from("shops")
        .select("id, name, address, phone, genre, plan_type, messages_sent_this_month, messages_limit, customers_limit, created_at, updated_at")
        .eq("id", profile.shop_id)
        .single();

      if (data) {
        setShop({
          ...data,
          line_channel_id: null,
          line_channel_secret: null,
          line_channel_access_token: null,
        } as Shop);
      }
      setLoading(false);
      setFormKey(prev => prev + 1);
    }

    async function fetchLineStatus() {
      try {
        const res = await fetch("/api/settings/line");
        if (res.ok) {
          const data = await res.json();
          setLineStatus(data);
        }
      } catch {
        // ignore
      }
    }

    fetchShop();
    fetchLineStatus();
  }, [supabase]);

  // 保存後のリロード用関数
  const reloadShop = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id) return;

    const { data } = await supabase
      .from("shops")
      .select("id, name, address, phone, genre, plan_type, messages_sent_this_month, messages_limit, customers_limit, created_at, updated_at")
      .eq("id", profile.shop_id)
      .single();

    if (data) {
      setShop({
        ...data,
        line_channel_id: null,
        line_channel_secret: null,
        line_channel_access_token: null,
      } as Shop);
    }
    setFormKey(prev => prev + 1);
  }, [supabase]);

  const reloadLineStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/line");
      if (res.ok) {
        const data = await res.json();
        setLineStatus(data);
      }
    } catch {
      // ignore
    }
  }, []);

  async function handleSaveShop(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!shop) return;
    setSaving(true);
    setMessage("");

    const form = new FormData(e.currentTarget);
    const { error } = await supabase
      .from("shops")
      .update({
        name: form.get("name") as string,
        address: (form.get("address") as string) || null,
        phone: (form.get("phone") as string) || null,
        genre: (form.get("genre") as string) || null,
      })
      .eq("id", shop.id);

    setSaving(false);
    setMessage(error ? `エラー: ${error.message}` : "店舗情報を更新しました");
    if (!error) reloadShop();
  }

  // S01修正: LINE設定はAPIルート経由で更新
  async function handleSaveLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!shop) return;
    setSavingLine(true);
    setMessage("");

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/settings/line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_channel_id: (form.get("line_channel_id") as string) || null,
          line_channel_secret: (form.get("line_channel_secret") as string) || null,
          line_channel_access_token: (form.get("line_channel_access_token") as string) || null,
        }),
      });

      if (res.ok) {
        setMessage("LINE連携設定を更新しました");
        reloadLineStatus();
      } else {
        const data = await res.json();
        setMessage(`エラー: ${data.error}`);
      }
    } catch {
      setMessage("エラー: 通信に失敗しました");
    }

    setSavingLine(false);
  }

  function getWebhookUrl() {
    if (!shop) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/api/webhook/line?shop_id=${shop.id}`;
  }

  const planLabels: Record<string, string> = {
    starter: "スターター",
    standard: "スタンダード",
    pro: "プロ",
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">設定</h1>
        <p className="text-sm text-muted-foreground">店舗情報が見つかりません。</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      {message && (
        <p className={`text-sm ${message.startsWith("エラー") ? "text-destructive" : "text-green-600"}`}>
          {message}
        </p>
      )}

      {/* Shop Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">店舗情報</CardTitle>
        </CardHeader>
        <CardContent>
          <form key={`shop-${formKey}`} onSubmit={handleSaveShop} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">店舗名</label>
              <Input name="name" defaultValue={shop.name} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">住所</label>
              <Input name="address" defaultValue={shop.address ?? ""} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">電話番号</label>
              <Input name="phone" defaultValue={shop.phone ?? ""} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">ジャンル</label>
              <Input name="genre" defaultValue={shop.genre ?? ""} placeholder="例: カフェ、居酒屋、美容室" />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "保存中..." : "保存"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* LINE Settings - S01修正: 秘密鍵はブラウザに送らない */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">LINE連携設定</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 設定ステータス表示 */}
          <div className="flex gap-2 text-sm">
            <Badge variant={lineStatus.has_channel_id ? "default" : "secondary"}>
              Channel ID: {lineStatus.has_channel_id ? "設定済み" : "未設定"}
            </Badge>
            <Badge variant={lineStatus.has_channel_secret ? "default" : "secondary"}>
              Secret: {lineStatus.has_channel_secret ? "設定済み" : "未設定"}
            </Badge>
            <Badge variant={lineStatus.has_access_token ? "default" : "secondary"}>
              Token: {lineStatus.has_access_token ? "設定済み" : "未設定"}
            </Badge>
          </div>

          <form onSubmit={handleSaveLine} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Channel ID</label>
              <Input
                name="line_channel_id"
                placeholder="LINE Developers で確認（上書き保存）"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Channel Secret</label>
              <Input
                name="line_channel_secret"
                type="password"
                placeholder="入力すると上書き保存されます"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Channel Access Token</label>
              <Input
                name="line_channel_access_token"
                type="password"
                placeholder="入力すると上書き保存されます"
              />
            </div>
            <Button type="submit" disabled={savingLine}>
              {savingLine ? "保存中..." : "LINE設定を保存"}
            </Button>
          </form>

          <Separator />

          <div>
            <label className="mb-1 block text-sm font-medium">Webhook URL</label>
            <p className="mb-2 text-xs text-muted-foreground">
              LINE Developers コンソールの Webhook URL にこのURLを設定してください。
            </p>
            <div className="flex gap-2">
              <Input readOnly value={getWebhookUrl()} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(getWebhookUrl());
                  setMessage("Webhook URLをコピーしました");
                }}
              >
                コピー
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">プラン情報</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">現在のプラン</dt>
              <dd>
                <Badge>{planLabels[shop.plan_type] ?? shop.plan_type}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">今月のメッセージ送信数</dt>
              <dd className="font-medium">
                {shop.messages_sent_this_month.toLocaleString()} / {shop.messages_limit.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">顧客上限</dt>
              <dd className="font-medium">{shop.customers_limit.toLocaleString()}人</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
