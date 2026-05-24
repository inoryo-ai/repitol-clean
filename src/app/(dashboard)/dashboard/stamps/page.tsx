"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { StampCard } from "@/lib/types/database";

export default function StampsPage() {
  const [cards, setCards] = useState<StampCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const supabase = createClient();

  async function getOrgId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .single();
    if (!profile?.shop_id) return null;
    const { data: shop } = await supabase
      .from("shops")
      .select("organization_id")
      .eq("id", profile.shop_id)
      .single();
    return shop?.organization_id ?? null;
  }

  const loadCards = useCallback(async () => {
    const orgId = await getOrgId();
    if (!orgId) return;
    const { data } = await supabase
      .from("stamp_cards")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    setCards((data as StampCard[]) ?? []);
    setLoading(false);
  }, [supabase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError("");

    const form = new FormData(e.currentTarget);
    const orgId = await getOrgId();
    if (!orgId) { setError("組織情報が取得できませんでした"); setCreating(false); return; }

    // 組織共通カードのため shop_id は null で作成
    const { error: insertError } = await supabase.from("stamp_cards").insert({
      organization_id: orgId,
      shop_id: null,
      name: form.get("name") as string,
      total_stamps: Number(form.get("total_stamps")),
      is_active: true,
    });

    if (insertError) {
      setError(`作成に失敗しました: ${insertError.message}`);
      setCreating(false);
      return;
    }

    setShowForm(false);
    setCreating(false);
    loadCards();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">スタンプカード管理</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "閉じる" : "新規作成"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">新しいスタンプカード</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  カード名 <span className="text-destructive">*</span>
                </label>
                <Input name="name" required placeholder="例: ランチスタンプカード" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  スタンプ数（完了まで） <span className="text-destructive">*</span>
                </label>
                <Input
                  name="total_stamps"
                  type="number"
                  min={1}
                  required
                  defaultValue={10}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={creating}>
                {creating ? "作成中..." : "作成する"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            スタンプカード一覧（{cards.length}件・組織共通）
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              スタンプカードがありません。「新規作成」から追加してください。
            </p>
          ) : (
            <div className="space-y-3">
              {cards.map((card) => (
                <div
                  key={card.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div>
                    <p className="font-medium">{card.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {card.total_stamps}個で特典
                      {card.mid_stamps && ` / ${card.mid_stamps}個で中間特典`}
                    </p>
                  </div>
                  <Badge variant={card.is_active ? "default" : "secondary"}>
                    {card.is_active ? "有効" : "無効"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
