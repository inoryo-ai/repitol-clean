"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

interface Shop { id: string; name: string }
interface Template { id: string; title: string; shop_id: string | null }
interface Trigger {
  id: string;
  shop_id: string;
  trigger_type: "first_visit" | "nth_visit" | "days_absent" | "manual";
  trigger_value: number;
  coupon_template_id: string | null;
  message_text: string;
  is_active: boolean;
}

const triggerLabels: Record<string, string> = {
  first_visit: "友だち追加時（初回）",
  nth_visit: "N回来店時",
  days_absent: "N日未来店",
  manual: "手動",
};

export default function AutoTriggersPage() {
  const supabase = createClient();
  const [shops, setShops] = useState<Shop[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) return;
    const { data: myShop } = await supabase
      .from("shops").select("organization_id").eq("id", profile.shop_id).single();
    if (!myShop?.organization_id) return;

    const { data: orgShops } = await supabase
      .from("shops").select("id, name")
      .eq("organization_id", myShop.organization_id).order("name");
    const { data: tpls } = await supabase
      .from("coupon_templates").select("id, title, shop_id")
      .eq("organization_id", myShop.organization_id)
      .eq("is_active", true).order("title");
    const shopIds = (orgShops ?? []).map(s => s.id);
    const { data: trigs } = await supabase
      .from("auto_triggers").select("*").in("shop_id", shopIds);

    setShops((orgShops as Shop[]) ?? []);
    setTemplates((tpls as Template[]) ?? []);
    setTriggers((trigs as Trigger[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(trig: Trigger) {
    await supabase.from("auto_triggers")
      .update({ is_active: !trig.is_active })
      .eq("id", trig.id);
    load();
  }

  async function remove(trig: Trigger) {
    if (!confirm(`このトリガーを削除しますか？`)) return;
    await supabase.from("auto_triggers").delete().eq("id", trig.id);
    load();
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const { error: insertError } = await supabase.from("auto_triggers").insert({
      shop_id: form.get("shop_id") as string,
      trigger_type: form.get("trigger_type") as string,
      trigger_value: Number(form.get("trigger_value")),
      coupon_template_id: (form.get("coupon_template_id") as string) || null,
      message_text: (form.get("message_text") as string) || "",
      is_active: true,
    });

    if (insertError) {
      setError(`作成失敗: ${insertError.message}`);
      setSaving(false);
      return;
    }
    setShowForm(false);
    setSaving(false);
    load();
  }

  function shopName(id: string) {
    return shops.find(s => s.id === id)?.name ?? id;
  }

  function templateTitle(id: string | null) {
    if (!id) return "—";
    return templates.find(t => t.id === id)?.title ?? "(不明)";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">自動トリガー</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "閉じる" : "新規作成"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        友だち追加時・特定条件で自動的にクーポンやメッセージを発行する仕組みです。
      </p>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-lg">新規トリガー</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">対象店舗</label>
                <select name="shop_id" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">トリガー種別</label>
                <select name="trigger_type" required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue="first_visit">
                  <option value="first_visit">友だち追加時（初回）</option>
                  <option value="nth_visit">N回来店時</option>
                  <option value="days_absent">N日未来店</option>
                  <option value="manual">手動</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">値（N）</label>
                <Input name="trigger_value" type="number" min={1} defaultValue={1} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">発行するクーポン</label>
                <select name="coupon_template_id" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">（なし）</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">送信メッセージ</label>
                <textarea name="message_text" className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={saving}>{saving ? "作成中..." : "作成"}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">設定済みトリガー（{triggers.length}件）</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : triggers.length === 0 ? (
            <p className="text-sm text-muted-foreground">トリガーがありません</p>
          ) : (
            <ul className="divide-y">
              {triggers.map(t => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <p className="font-medium">
                      {triggerLabels[t.trigger_type]} {t.trigger_type !== "first_visit" && `(N=${t.trigger_value})`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {shopName(t.shop_id)} / クーポン: {templateTitle(t.coupon_template_id)}
                    </p>
                  </div>
                  <Badge variant={t.is_active ? "default" : "secondary"}>
                    {t.is_active ? "有効" : "無効"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => toggleActive(t)}>
                    {t.is_active ? "無効化" : "有効化"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(t)}>
                    削除
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
