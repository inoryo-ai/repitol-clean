"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const INTERNAL_DOMAIN = "@repitol.local";

function toSignupEmail(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  if (v.includes("@")) return v;
  return `${v.toLowerCase()}${INTERNAL_DOMAIN}`;
}

function isValidLoginId(v: string): boolean {
  // 半角英数 + _ - . （3-32文字） or email 形式
  if (v.includes("@")) return /.+@.+\..+/.test(v);
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(v);
}

export default function SignupPage() {
  const [shopName, setShopName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValidLoginId(loginId)) {
      setError("IDは半角英数・ハイフン・アンダースコアで3〜32文字で入力してください");
      return;
    }
    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }
    if (password.length < 6) {
      setError("パスワードは6文字以上で入力してください");
      return;
    }
    if (!shopName.trim()) {
      setError("店舗名を入力してください");
      return;
    }

    setLoading(true);

    const supabase = createClient();

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: toSignupEmail(loginId),
      password,
      options: {
        data: {
          display_name: displayName,
          shop_name: shopName,
        },
      },
    });

    if (authError) {
      if (authError.message.includes("already")) {
        setError("このIDは既に使われています");
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    if (authData.user) {
      const { data: shop, error: shopError } = await supabase
        .from("shops")
        .insert({ name: shopName.trim() })
        .select("id")
        .single();

      if (!shopError && shop) {
        await supabase
          .from("profiles")
          .update({
            display_name: displayName.trim() || null,
            shop_id: shop.id,
            role: "owner",
          })
          .eq("id", authData.user.id);
      }
    }

    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">登録が完了しました</CardTitle>
          <CardDescription>
            ID「{loginId}」で登録が完了しました。ログインしてご利用ください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login">
            <Button variant="outline" className="w-full">
              ログインページへ
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">新規登録</CardTitle>
        <CardDescription>
          アカウントを作成してリピトルを始めましょう
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="shop-name" className="text-sm font-medium">
              店舗名
            </label>
            <Input
              id="shop-name"
              type="text"
              placeholder="例: 居酒屋まるまる"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="display-name" className="text-sm font-medium">
              お名前
            </label>
            <Input
              id="display-name"
              type="text"
              placeholder="例: 山田 太郎"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="loginId" className="text-sm font-medium">
              ID
            </label>
            <Input
              id="loginId"
              type="text"
              placeholder="半角英数で3〜32文字（例: Centaurus001）"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoComplete="username"
            />
            <p className="text-xs text-muted-foreground">
              ログインに使うIDです。半角英数とハイフン・アンダースコアが使えます。
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              パスワード
            </label>
            <Input
              id="password"
              type="password"
              placeholder="6文字以上"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              パスワード（確認）
            </label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="もう一度入力"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "登録中..." : "無料で始める"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            すでにアカウントをお持ちですか？{" "}
            <Link
              href="/login"
              className="text-primary underline underline-offset-4 hover:text-primary/80"
            >
              ログイン
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
