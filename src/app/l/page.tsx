"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function DispatcherPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Dispatcher />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-orange-50 to-white">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
    </div>
  );
}

function Dispatcher() {
  const params = useSearchParams();
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const to = params.get("to") ?? "stamp";
      const target = to === "coupon" ? "/coupon" : "/stamp";
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

      // sessionStorage に既に uid があれば LIFF 初期化をスキップして即遷移
      const cached = typeof window !== "undefined"
        ? sessionStorage.getItem("repitol_line_user_id")
        : null;
      if (cached) {
        window.location.replace(target);
        return;
      }

      if (!liffId) {
        setErrorMsg("LIFF_ID が設定されていません");
        return;
      }

      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (cancelled) return;

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        if (cancelled) return;

        sessionStorage.setItem("repitol_line_user_id", profile.userId);
      } catch (err) {
        console.error("LIFF init error:", err);
        if (!sessionStorage.getItem("repitol_line_user_id")) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          return;
        }
      }

      if (cancelled) return;
      // 確実に遷移させるため window.location を使用
      window.location.replace(target);
    }

    run();
    return () => { cancelled = true; };
  }, [params]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-orange-50 to-white">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
        <p className="mt-4 text-sm text-gray-500">
          {errorMsg ? "認証エラー" : "読み込み中..."}
        </p>
        {errorMsg && <p className="mt-2 text-xs text-gray-400">{errorMsg}</p>}
      </div>
    </div>
  );
}
