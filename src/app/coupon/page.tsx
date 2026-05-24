"use client";

import { useCallback, useEffect, useState } from "react";
import { LegalFooter } from "@/components/legal-footer";

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

export default function CouponListPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "confirming" | "final_confirm" | "using" | "done" | "no_uid" | "error">("loading");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    // sessionStorage の uid を使う。無ければ /l dispatcher に誘導（LIFF 認証を一元化）
    const stored = sessionStorage.getItem("repitol_line_user_id");
    if (stored) {
      setUid(stored);
      return;
    }
    window.location.href = "/l?to=coupon";
  }, []);

  const loadCoupons = useCallback(async () => {
    if (!uid) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/coupons/my?line_user_id=${encodeURIComponent(uid)}`);
      if (!res.ok) {
        setErrorMsg("クーポンを取得できませんでした");
        setStatus("error");
        return;
      }
      const data = await res.json();
      setCoupons(data.coupons ?? []);
      setStatus("ready");
    } catch {
      setErrorMsg("通信エラー");
      setStatus("error");
    }
  }, [uid]);

  useEffect(() => {
    if (uid) loadCoupons();
  }, [uid, loadCoupons]);

  async function useCoupon() {
    if (!selected || !uid) return;
    setStatus("using");
    try {
      const res = await fetch("/api/coupons/use-liff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupon_id: selected.id, line_user_id: uid }),
      });
      if (!res.ok) {
        const d = await res.json();
        setErrorMsg(d.error_ja ?? d.error ?? "エラー");
        setStatus("error");
        return;
      }
      setStatus("done");
      await loadCoupons();
    } catch {
      setErrorMsg("通信エラー");
      setStatus("error");
    }
  }

  const active = coupons.filter(c => c.status === "active");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-50 to-white">
      <header className="bg-orange-500 px-4 py-4 text-center text-white shadow-md">
        <h1 className="text-xl font-bold">マイクーポン</h1>
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-6">
        <div className="w-full max-w-sm space-y-4">
          {status === "loading" && (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            </div>
          )}

          {status === "no_uid" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">📱</div>
              <p className="text-sm text-gray-600">
                LINEのリッチメニューから<br />「マイクーポン」を開き直してください。
              </p>
            </div>
          )}

          {status === "ready" && active.length === 0 && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">🎟️</div>
              <p className="text-sm text-gray-600">
                現在利用可能なクーポンはありません。<br />
                スタンプを貯めて特典をゲット!
              </p>
            </div>
          )}

          {status === "ready" && active.map(c => (
            <button
              key={c.id}
              onClick={() => { setSelected(c); setStatus("confirming"); }}
              className="w-full rounded-2xl bg-white p-4 text-left shadow-lg active:scale-95 transition"
            >
              {c.coupon_templates.image_url && (
                <img src={c.coupon_templates.image_url} alt={c.coupon_templates.title}
                     className="mb-3 w-full rounded-xl object-cover" />
              )}
              <h3 className="font-bold text-gray-800">{c.coupon_templates.title}</h3>
              <p className="mt-1 text-sm text-gray-600">{c.coupon_templates.description}</p>
              <p className="mt-2 text-xs text-gray-400">
                有効期限: {new Date(c.expires_at).toLocaleDateString("ja-JP")}
              </p>
            </button>
          ))}

          {status === "confirming" && selected && (
            <div className="rounded-2xl bg-white p-6 shadow-lg space-y-4">
              {selected.coupon_templates.image_url && (
                <img src={selected.coupon_templates.image_url} alt={selected.coupon_templates.title}
                     className="w-full rounded-xl object-cover" />
              )}
              <h2 className="text-lg font-bold text-gray-800 text-center">
                {selected.coupon_templates.title}
              </h2>
              {selected.coupon_templates.description && (
                <p className="text-sm text-gray-600 text-center whitespace-pre-line">
                  {selected.coupon_templates.description}
                </p>
              )}
              <p className="text-center text-xs text-gray-500">
                有効期限: {new Date(selected.expires_at).toLocaleDateString("ja-JP")}
              </p>
              <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-800 text-center leading-relaxed">
                このクーポンをご利用ですか？<br />
                次の画面で最終確認があります。
              </p>
              <div className="flex gap-2">
                <button onClick={() => { setSelected(null); setStatus("ready"); }}
                        className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-4 py-3 font-bold text-gray-500">
                  戻る
                </button>
                <button onClick={() => setStatus("final_confirm")}
                        className="flex-1 rounded-xl bg-orange-500 px-4 py-3 font-bold text-white">
                  使う
                </button>
              </div>
            </div>
          )}

          {status === "final_confirm" && selected && (
            <div className="rounded-2xl bg-white p-6 shadow-2xl space-y-5 border-4 border-red-400">
              <div className="text-center text-5xl">⚠️</div>
              <h2 className="text-xl font-bold text-red-600 text-center">
                最終確認
              </h2>
              <p className="text-center text-base font-bold text-gray-800">
                {selected.coupon_templates.title}
              </p>
              <div className="rounded-xl bg-red-50 p-4 space-y-2">
                <p className="text-sm text-red-800 text-center font-bold">
                  従業員の目の前で押してください
                </p>
                <p className="text-xs text-red-700 text-center leading-relaxed">
                  「使用する」ボタンを押すと<br />
                  このクーポンは<strong>即座に無効</strong>になり、<br />
                  取り消しできません。
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStatus("confirming")}
                        className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-4 py-3 font-bold text-gray-500">
                  戻る
                </button>
                <button onClick={useCoupon}
                        className="flex-1 rounded-xl bg-red-500 px-4 py-3 font-bold text-white shadow-lg">
                  使用する
                </button>
              </div>
            </div>
          )}

          {status === "using" && (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            </div>
          )}

          {status === "done" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">🎉</div>
              <h2 className="text-lg font-bold text-gray-700">使用しました!</h2>
              <button onClick={() => { setSelected(null); loadCoupons(); }}
                      className="mt-4 w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500">
                クーポン一覧に戻る
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">😢</div>
              <p className="text-sm text-gray-600">{errorMsg}</p>
              <button onClick={() => loadCoupons()}
                      className="mt-4 w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500">
                もう一度読み込む
              </button>
            </div>
          )}
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
