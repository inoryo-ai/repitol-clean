"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ID（ユーザー名）を Supabase の email として扱うための内部ドメイン
const INTERNAL_DOMAIN = "@repitol.local";

function toLoginEmail(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  // @ を含む場合は既に email として扱う（後方互換）
  if (v.includes("@")) return v;
  // それ以外は ID として内部ドメインを付加
  return `${v.toLowerCase()}${INTERNAL_DOMAIN}`;
}

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: toLoginEmail(loginId),
      password,
    });

    if (error) {
      setError("IDまたはパスワードが正しくありません");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">ログイン</CardTitle>
        <CardDescription>
          IDとパスワードを入力してください
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="loginId" className="text-sm font-medium">
              ID
            </label>
            <Input
              id="loginId"
              type="text"
              placeholder="例: Centaurus001"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              autoComplete="username"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              パスワード
            </label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "ログイン中..." : "ログイン"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            アカウントをお持ちでないですか？{" "}
            <Link href="/signup" className="text-primary underline underline-offset-4 hover:text-primary/80">
              新規登録
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
