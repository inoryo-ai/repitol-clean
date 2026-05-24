"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";

// 文言テンプレート（文字だけ。画像は不要）
const MESSAGE_TEMPLATES: { label: string; text: string }[] = [
  {
    label: "今月のクーポン配布",
    text: "今月もご愛顧いただきありがとうございます。\n特別クーポンをお届けしました。ご来店の際にお使いください。\n\nお会計時に従業員までご提示ください。",
  },
  {
    label: "新メニューのご案内",
    text: "Demo Restaurantより新メニューのお知らせです。\nこだわりの一杯をご用意しました。ぜひご賞味ください。\n\nご来店を心よりお待ちしております。",
  },
  {
    label: "夏の限定メニュー",
    text: "暑い季節にぴったりの夏限定メニューが登場しました。\n期間限定・数量限定となりますので、お早めにお楽しみください。",
  },
  {
    label: "冬の温まる一杯",
    text: "寒い日が続いていますね。\nあたたかい味噌ラーメンで心も体もほっこり温まってください。\n\n冬の定番メニューで皆さまをお迎えしています。",
  },
  {
    label: "お誕生日おめでとう",
    text: "お誕生日おめでとうございます!\nささやかですが、バースデークーポンをプレゼントいたしました。\n\n素敵な一年となりますように。またのご来店をお待ちしております。",
  },
  {
    label: "お久しぶりです",
    text: "最近ご来店いただけておらずご無沙汰しております。\nまたお会いできる日を楽しみにしております。\n\nぜひお気軽にお立ち寄りください。",
  },
  {
    label: "スタンプリマインド",
    text: "スタンプカード、もう少しでコンプリートです!\nあと少しのご来店で特典をお渡しできます。\nお食事の際はスタンプをお忘れなく。",
  },
  {
    label: "営業日のお知らせ",
    text: "営業時間・定休日変更のお知らせです。\n詳細は店頭または公式アカウントからご確認ください。\n\nご迷惑をおかけしますがよろしくお願いいたします。",
  },
  {
    label: "感謝メッセージ",
    text: "いつもDemo Restaurantをご愛顧いただき、誠にありがとうございます。\nこれからも皆さまに美味しい一杯をお届けできるよう努めてまいります。",
  },
  {
    label: "週末キャンペーン",
    text: "今週末限定のキャンペーンのお知らせです。\n人気メニューを特別価格でご提供いたします。\n\nぜひこの機会にご来店ください。",
  },
];

interface Shop { id: string; name: string; line_channel_access_token: string | null }
interface Customer { id: string; display_name: string | null; tags: string[] }
interface CouponTpl { id: string; title: string; valid_days: number; image_url: string | null }

export default function BroadcastPage() {
  const supabase = createClient();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [messageText, setMessageText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrlManual, setImageUrlManual] = useState(false); // 手動入力を検知
  const [attachCouponId, setAttachCouponId] = useState<string>("");
  const [couponTemplates, setCouponTemplates] = useState<CouponTpl[]>([]);
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<{ success: number; fail: number } | null>(null);

  const loadShops = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from("profiles").select("shop_id").eq("id", user.id).single();
    if (!profile?.shop_id) return;
    const { data: userShop } = await supabase
      .from("shops").select("organization_id").eq("id", profile.shop_id).single();
    if (!userShop?.organization_id) return;
    const { data: allShops } = await supabase
      .from("shops")
      .select("id, name, line_channel_access_token")
      .eq("organization_id", userShop.organization_id)
      .order("name");
    setShops((allShops as Shop[]) ?? []);
    if (allShops && allShops.length > 0) setSelectedShopId(profile.shop_id);

    // 組織の有効なクーポンテンプレート一覧
    const { data: tpls } = await supabase
      .from("coupon_templates")
      .select("id, title, valid_days, image_url")
      .eq("organization_id", userShop.organization_id)
      .eq("is_active", true)
      .order("title");
    setCouponTemplates((tpls as CouponTpl[]) ?? []);
  }, [supabase]);

  useEffect(() => { loadShops(); }, [loadShops]);

  // 014: customer_shop_memberships ベースで友だち一覧取得
  const loadCustomers = useCallback(async () => {
    if (!selectedShopId) return;
    const { data: memberships } = await supabase
      .from("customer_shop_memberships")
      .select("customer_id")
      .eq("shop_id", selectedShopId)
      .eq("is_blocked", false);
    const ids = (memberships ?? []).map(m => m.customer_id);
    if (ids.length === 0) {
      setCustomers([]);
      setSelected(new Set());
      return;
    }
    const { data } = await supabase
      .from("customers")
      .select("id, display_name, tags")
      .in("id", ids)
      .eq("is_blocked", false)
      .order("last_visit_at", { ascending: false, nullsFirst: false })
      .limit(500);
    setCustomers((data as Customer[]) ?? []);
    setSelected(new Set());
  }, [selectedShopId, supabase]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  function selectAll() { setSelected(new Set(customers.map(c => c.id))); }
  function clearAll() { setSelected(new Set()); }

  async function send() {
    if (!messageText.trim() && !imageUrl.trim() && !attachCouponId) {
      setErrorMsg("テキスト・画像・クーポンのどれかを指定してください");
      return;
    }
    if (selected.size === 0) return;
    if (!confirm(`${selected.size}人に配信します。本当に送信しますか？`)) return;

    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_id: selectedShopId,
          customer_ids: Array.from(selected),
          message_text: messageText,
          image_url: imageUrl || null,
          coupon_template_id: attachCouponId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "配信失敗");
        setStatus("error");
        return;
      }
      setResult({ success: data.success ?? 0, fail: data.fail ?? 0 });
      setStatus("done");
      setMessageText("");
      setImageUrl("");
      setImageUrlManual(false);
      setAttachCouponId("");
      setSelected(new Set());
    } catch {
      setErrorMsg("通信エラー");
      setStatus("error");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">一斉配信</h1>

      <Card>
        <CardHeader><CardTitle className="text-lg">配信元店舗</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            LINE公式アカウントは店舗ごとに分かれているため、配信元を選んでください。選んだ店舗のLINE友だちのみに配信されます。
          </p>
          <select
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {shops.map(s => (
              <option key={s.id} value={s.id}>
                {s.name} {s.line_channel_access_token ? "" : "（LINE未設定）"}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">配信対象（{selected.size} / {customers.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAll}>全選択</Button>
            <Button type="button" size="sm" variant="outline" onClick={clearAll}>全解除</Button>
          </div>
          <div className="max-h-96 overflow-y-auto rounded-md border">
            {customers.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">この店舗に LINE 友だちがいません</p>
            ) : (
              <ul className="divide-y">
                {customers.map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm">{c.display_name ?? "名前未設定"}</span>
                    <div className="flex gap-1">
                      {c.tags?.map(t => (
                        <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">メッセージ</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">テキスト（任意）</label>
            <select
              onChange={(e) => {
                if (e.target.value) setMessageText(e.target.value);
              }}
              value=""
              className="mb-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">（文言テンプレートから選ぶ）</option>
              {MESSAGE_TEMPLATES.map(t => (
                <option key={t.label} value={t.text}>{t.label}</option>
              ))}
            </select>
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="配信するメッセージを入力"
              className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">画像（任意）</label>
            <ImageUploader
              value={imageUrl || null}
              onChange={(url) => {
                setImageUrl(url ?? "");
                setImageUrlManual(!!url);
              }}
              folder="broadcast"
              allowManualUrl
            />
            <p className="mt-2 text-xs text-muted-foreground">
              画像は JPEG / PNG。クーポンを選んでいれば、そのクーポン画像が自動で入ります。
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">クーポン添付（任意）</label>
            <select
              value={attachCouponId}
              onChange={(e) => {
                const v = e.target.value;
                setAttachCouponId(v);
                // 手動で画像URLを入れていなければ、選んだクーポンの画像を自動反映（切替時も更新）
                if (!imageUrlManual) {
                  if (v) {
                    const tpl = couponTemplates.find(t => t.id === v);
                    setImageUrl(tpl?.image_url ?? "");
                  } else {
                    setImageUrl("");
                  }
                }
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">（クーポンを添付しない）</option>
              {couponTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}（{t.valid_days}日間）{t.image_url ? " 🖼" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              選択すると配信と同時に受信者全員に発行されます。🖼マークのクーポンは画像が登録済みで、選択時に自動的に画像欄にセットされます（手動変更も可）。
            </p>
          </div>

          <div className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800">
            配信内容: <br />
            {imageUrl && <span>📷 画像</span>}
            {imageUrl && (messageText || attachCouponId) && <span> + </span>}
            {messageText && <span>📝 テキスト</span>}
            {messageText && attachCouponId && <span> + </span>}
            {attachCouponId && <span>🎟️ クーポン発行</span>}
            {!imageUrl && !messageText && !attachCouponId && <span>（何も指定されていません）</span>}
          </div>

          <p className="text-xs text-muted-foreground">
            LINE利用料金は甲の契約プランに依存します（ライトプラン 5,000通/月）。画像付き配信も1通としてカウントされます。
          </p>

          {status === "error" && <p className="text-sm text-destructive">{errorMsg}</p>}
          {status === "done" && result && (
            <p className="text-sm text-green-700">
              配信完了: 成功 {result.success}件 / 失敗 {result.fail}件
            </p>
          )}

          <Button
            onClick={send}
            disabled={status === "sending" || selected.size === 0}
          >
            {status === "sending" ? "配信中..." : `${selected.size}人に配信`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
