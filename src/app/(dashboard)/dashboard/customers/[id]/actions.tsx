"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function CheckInButton({ customerId }: { customerId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCheckIn() {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${customerId}/visit`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "チェックインに失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    }
    setLoading(false);
  }

  return (
    <Button size="sm" onClick={handleCheckIn} disabled={loading}>
      {loading ? "処理中..." : "来店チェックイン"}
    </Button>
  );
}

export function GrantStampButton({
  customerId,
  stampCardId,
}: {
  customerId: string;
  stampCardId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleGrant() {
    setLoading(true);
    try {
      const res = await fetch("/api/stamps/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: customerId,
          stamp_card_id: stampCardId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.reward_type === "full") {
          alert("スタンプカードコンプリート! 特典クーポンを発行しました。");
        } else if (data.reward_type === "mid") {
          alert("中間特典達成! クーポンを発行しました。");
        }
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error ?? "スタンプ付与に失敗しました");
      }
    } catch {
      alert("通信エラーが発生しました");
    }
    setLoading(false);
  }

  return (
    <Button size="sm" variant="outline" onClick={handleGrant} disabled={loading}>
      {loading ? "処理中..." : "スタンプ付与"}
    </Button>
  );
}
