"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LiffRouterPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LiffRouter />
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-orange-50 to-white">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
        <p className="mt-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    </div>
  );
}

function LiffRouter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

    async function init() {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId: liffId! });

        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        const lineUserId = profile.userId;
        const idToken = liff.getIDToken() ?? "";

        // クエリパラメータからページとshop_idを取得
        const page = searchParams.get("page") ?? "coupon";
        const shopId = searchParams.get("shop_id") ?? "";

        // 認証情報をsessionStorageに保存（遷移先で使用）
        sessionStorage.setItem("liff_line_user_id", lineUserId);
        sessionStorage.setItem("liff_id_token", idToken);
        sessionStorage.setItem("liff_display_name", profile.displayName ?? "");

        // 対象ページにリダイレクト
        if (page === "stamp") {
          router.replace(`/stamp/${shopId}`);
        } else {
          router.replace(`/coupon/${shopId}`);
        }
      } catch (err) {
        console.error("LIFF init error:", err);
      }
    }

    init();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-orange-50 to-white">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
        <p className="mt-4 text-sm text-gray-500">読み込み中...</p>
      </div>
    </div>
  );
}
