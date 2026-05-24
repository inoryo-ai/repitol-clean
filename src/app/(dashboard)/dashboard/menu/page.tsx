"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageUploader } from "@/components/image-uploader";
import { createClient } from "@/lib/supabase/client";

interface MenuItem {
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export default function MenuPage() {
  const supabase = createClient();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .order("sort_order");
    setItems((data as MenuItem[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function save(item: MenuItem) {
    setError("");
    const isNew = !items.find(i => i.id === item.id);
    const res = await fetch(isNew ? "/api/menu" : `/api/menu/${item.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: item.title,
        subtitle: item.subtitle,
        image_url: item.image_url || null,
        sort_order: item.sort_order,
        is_active: item.is_active,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "保存失敗");
      return;
    }
    setEditing(null);
    setCreating(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm("このメニュー項目を削除しますか？")) return;
    await fetch(`/api/menu/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">おすすめメニュー</h1>
        <Button onClick={() => {
          setCreating(true);
          setEditing({
            id: "new",
            title: "",
            subtitle: "",
            image_url: "",
            sort_order: items.length + 1,
            is_active: true,
          });
        }}>
          新規追加
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        LINE で「メニュー」と送信された際にカルーセル返信される項目を管理します（最大10件推奨）。
      </p>

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{creating ? "新規追加" : "編集"}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={(e) => { e.preventDefault(); save(editing); }} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">タイトル</label>
                <Input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} required />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">サブタイトル</label>
                <Input value={editing.subtitle} onChange={e => setEditing({ ...editing, subtitle: e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">画像</label>
                <ImageUploader
                  value={editing.image_url}
                  onChange={(url) => setEditing({ ...editing, image_url: url })}
                  folder="menu"
                  allowManualUrl
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">並び順</label>
                <Input type="number" value={editing.sort_order}
                       onChange={e => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2">
                <input id="ma" type="checkbox" checked={editing.is_active} className="h-4 w-4"
                       onChange={e => setEditing({ ...editing, is_active: e.target.checked })} />
                <label htmlFor="ma" className="text-sm">有効にする</label>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="submit">保存</Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(null); setCreating(false); }}>
                  キャンセル
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-lg">メニュー項目（{items.length}件）</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              項目がありません。「新規追加」からメニューを登録してください。
            </p>
          ) : (
            <ul className="divide-y">
              {items.map(item => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.title} className="h-16 w-16 rounded-md object-cover" />
                  ) : (
                    <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      no image
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.subtitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">並び順: {item.sort_order}</p>
                  </div>
                  <Badge variant={item.is_active ? "default" : "secondary"}>
                    {item.is_active ? "有効" : "無効"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => { setCreating(false); setEditing(item); }}>
                    編集
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => remove(item.id)}>
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
