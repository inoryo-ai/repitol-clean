"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface StampResult {
  success: boolean;
  shop_name?: string;
  current_stamps?: number;
  total_stamps?: number;
  mid_stamps?: number | null;
  completed_count?: number;
  reward_type?: "none" | "mid" | "full";
  reward_message?: string;
  error?: string;
  error_ja?: string;
}

export default function ShopStampPage() {
  const params = useParams();
  const shopCode = params.code as string;

  const [status, setStatus] = useState<"loading" | "success" | "already" | "error" | "no_uid">("loading");
  const [result, setResult] = useState<StampResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const uid = sessionStorage.getItem("repitol_line_user_id");
    if (!uid) {
      setStatus("no_uid");
      return;
    }
    grantStamp(uid, shopCode);
  }, [shopCode]);

  async function grantStamp(uid: string, code: string) {
    try {
      const res = await fetch("/api/stamps/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_code: code, line_user_id: uid }),
      });
      const data: StampResult = await res.json();

      if (res.status === 429) {
        setStatus("already");
        setErrorMsg(data.error_ja ?? "前回のスタンプから12時間経っていません。");
        return;
      }
      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error_ja ?? data.error ?? "エラーが発生しました");
        return;
      }
      setResult(data);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("通信エラーが発生しました");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-50 to-white">
      <header className="bg-orange-500 px-4 py-4 text-center text-white shadow-md">
        <h1 className="text-xl font-bold">
          {result?.shop_name ?? "スタンプ付与"}
        </h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          {status === "loading" && (
            <div className="flex flex-col items-center space-y-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
              <p className="text-gray-500">スタンプを押しています...</p>
            </div>
          )}

          {status === "success" && result && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              {result.reward_type === "full" ? (
                <>
                  <div className="mb-4 text-6xl">🎉</div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">コンプリート!</h2>
                  <p className="text-gray-700">{result.reward_message}</p>
                </>
              ) : result.reward_type === "mid" ? (
                <>
                  <div className="mb-4 text-6xl">🎊</div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">中間特典ゲット!</h2>
                  <p className="text-gray-700">{result.reward_message}</p>
                </>
              ) : (
                <>
                  <div className="mb-4 text-6xl">⭐</div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">スタンプ獲得!</h2>
                </>
              )}
              <p className="mt-4 text-3xl font-bold text-orange-600">
                {result.current_stamps}
                <span className="text-xl text-gray-500">/{result.total_stamps}</span>
              </p>
            </div>
          )}

          {status === "already" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">✅</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">本日は取得済みです</h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
          )}

          {status === "no_uid" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">📱</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">LINEから認証が必要です</h2>
              <p className="text-sm text-gray-600 leading-relaxed">
                LINEのトーク画面のメニューから<br />
                「スタンプを貯める」を1回タップしてから<br />
                もう一度QRコードを読み取ってください。
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">😢</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">エラー</h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
          )}
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-gray-400">
        Powered by リピトル
      </footer>
    </div>
  );
}
