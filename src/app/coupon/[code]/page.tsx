"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Coupon {
  id: string;
  status: "active" | "used" | "expired";
  coupon_code: string;
  issued_at: string;
  expires_at: string;
  used_at: string | null;
  exclusive_group_id: string | null;
  coupon_templates: {
    title: string;
    description: string;
    image_url: string | null;
  };
}

export default function CouponPage() {
  const params = useParams();
  const shopId = params.code as string;

  const [status, setStatus] = useState<"loading" | "ready" | "confirming" | "using" | "done" | "error">("loading");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [liffReady, setLiffReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // 認証情報を取得（URLパラメータ or sessionStorage or LIFF）
  useEffect(() => {
    // URLパラメータにuidがあればそれを使う（Webhook経由のリンク）
    const urlParams = new URLSearchParams(window.location.search);
    const uid = urlParams.get("uid");
    if (uid) {
      setLineUserId(uid);
      setLiffReady(true);
      sessionStorage.setItem("liff_line_user_id", uid);
      setStatus("ready");
      return;
    }

    // sessionStorageにLIFF認証情報があればそれを使う
    const storedUserId = sessionStorage.getItem("liff_line_user_id");
    if (storedUserId) {
      setLineUserId(storedUserId);
      setLiffReady(true);
      setStatus("ready");
      return;
    }

    // なければページを表示（認証なし）
    setStatus("ready");
  }, []);

  // クーポン一覧を取得
  const loadCoupons = useCallback(async () => {
    if (!lineUserId || !shopId) return;

    try {
      const res = await fetch(`/api/coupons/my?shop_id=${shopId}&line_user_id=${lineUserId}`);
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons ?? []);
      }
    } catch {
      // エラー時は空配列のまま
    }
  }, [lineUserId, shopId]);

  useEffect(() => {
    if (lineUserId) loadCoupons();
  }, [lineUserId, loadCoupons]);

  // クーポン使用
  async function handleUseCoupon() {
    if (!selectedCoupon || !lineUserId) return;

    setStatus("using");

    try {
      const body: Record<string, string> = {
        coupon_id: selectedCoupon.id,
        line_user_id: lineUserId,
      };

      if (liffReady) {
        try {
          const liff = (await import("@line/liff")).default;
          const token = liff.getIDToken();
          if (token) body.liff_token = token;
        } catch {
          // トークン取得失敗は無視
        }
      }

      const res = await fetch("/api/coupons/use-liff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error_ja ?? data.error ?? "エラーが発生しました");
        setStatus("error");
        return;
      }

      setStatus("done");
      // 一覧を更新
      await loadCoupons();
    } catch {
      setErrorMsg("通信エラーが発生しました");
      setStatus("error");
    }
  }

  const activeCoupons = coupons.filter((c) => c.status === "active");
  const usedCoupons = coupons.filter((c) => c.status === "used" || c.status === "expired");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <header className="bg-orange-500 px-4 py-4 text-center text-white shadow-md">
        <h1 className="text-xl font-bold">マイクーポン</h1>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-6">
        {/* ローディング */}
        {status === "loading" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
          </div>
        )}

        {/* クーポン一覧 */}
        {status === "ready" && (
          <div className="w-full max-w-sm space-y-4">
            {activeCoupons.length === 0 ? (
              <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
                <div className="mb-4 text-5xl">🎫</div>
                <p className="text-gray-500">利用可能なクーポンはありません</p>
              </div>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-500">利用可能（{activeCoupons.length}枚）</p>
                {activeCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="rounded-2xl bg-white shadow-lg overflow-hidden"
                  >
                    <div className="bg-orange-500 px-4 py-2">
                      <p className="text-sm font-bold text-white">
                        {coupon.coupon_templates.title}
                      </p>
                    </div>
                    {coupon.coupon_templates.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coupon.coupon_templates.image_url}
                        alt={coupon.coupon_templates.title}
                        className="w-full h-auto object-cover"
                      />
                    )}
                    <div className="p-4">
                      <p className="text-sm text-gray-600 mb-3">
                        {coupon.coupon_templates.description}
                      </p>
                      {coupon.exclusive_group_id && (
                        <p className="text-xs text-amber-600 mb-2 font-semibold">
                          ⚠️ 同時発行された他のクーポンは、このクーポンを使用すると失効します
                        </p>
                      )}
                      <p className="text-xs text-gray-400 mb-3">
                        有効期限: {new Date(coupon.expires_at).toLocaleDateString("ja-JP")}
                      </p>
                      <button
                        onClick={() => {
                          setSelectedCoupon(coupon);
                          setStatus("confirming");
                        }}
                        className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white shadow transition-all active:scale-95 hover:bg-orange-600"
                      >
                        このクーポンを使う
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {usedCoupons.length > 0 && (
              <>
                <p className="mt-6 text-sm font-medium text-gray-400">使用済み・期限切れ</p>
                {usedCoupons.map((coupon) => (
                  <div
                    key={coupon.id}
                    className="rounded-2xl bg-gray-100 shadow overflow-hidden opacity-60"
                  >
                    <div className="bg-gray-400 px-4 py-2">
                      <p className="text-sm font-bold text-white">
                        {coupon.coupon_templates.title}
                      </p>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-gray-400">
                        {coupon.status === "used"
                          ? `使用済み（${new Date(coupon.used_at!).toLocaleDateString("ja-JP")}）`
                          : "期限切れ"}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* 確認画面 */}
        {status === "confirming" && selectedCoupon && (
          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">🎫</div>
              <h2 className="mb-2 text-lg font-bold text-gray-800">
                クーポンを使用しますか？
              </h2>
              <div className="mb-4 rounded-xl bg-orange-50 p-4">
                {selectedCoupon.coupon_templates.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedCoupon.coupon_templates.image_url}
                    alt={selectedCoupon.coupon_templates.title}
                    className="w-full h-auto rounded-lg mb-3"
                  />
                )}
                <p className="text-lg font-bold text-orange-600">
                  {selectedCoupon.coupon_templates.title}
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedCoupon.coupon_templates.description}
                </p>
              </div>
              {selectedCoupon.exclusive_group_id && (
                <p className="mb-2 text-xs text-amber-600 font-semibold">
                  ⚠️ このクーポンを使用すると、同時発行された他のクーポンは失効します
                </p>
              )}
              <p className="mb-4 text-xs text-red-500 font-medium">
                ※ スタッフに画面を見せてからボタンを押してください
              </p>
              <button
                onClick={handleUseCoupon}
                className="w-full rounded-xl bg-orange-500 px-4 py-4 text-lg font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-orange-600"
              >
                使用する
              </button>
              <button
                onClick={() => {
                  setSelectedCoupon(null);
                  setStatus("ready");
                }}
                className="mt-3 w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-500"
              >
                戻る
              </button>
            </div>
          </div>
        )}

        {/* 使用処理中 */}
        {status === "using" && (
          <div className="flex flex-1 flex-col items-center justify-center space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            <p className="text-gray-500">処理中...</p>
          </div>
        )}

        {/* 使用完了 */}
        {status === "done" && (
          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-6xl">✅</div>
              <h2 className="mb-2 text-xl font-bold text-orange-500">
                クーポンを使用しました！
              </h2>
              <p className="text-gray-500">ありがとうございます</p>
            </div>
            <button
              onClick={() => {
                setSelectedCoupon(null);
                setStatus("ready");
              }}
              className="w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500"
            >
              クーポン一覧に戻る
            </button>
          </div>
        )}

        {/* エラー */}
        {status === "error" && (
          <div className="w-full max-w-sm space-y-4">
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">😢</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">エラー</h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
            <button
              onClick={() => {
                setSelectedCoupon(null);
                setStatus("ready");
              }}
              className="w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500"
            >
              戻る
            </button>
          </div>
        )}
      </main>

      <footer className="py-4 text-center text-xs text-gray-400">
        Powered by リピトル
      </footer>
    </div>
  );
}
