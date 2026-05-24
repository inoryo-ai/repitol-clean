"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { LegalFooter } from "@/components/legal-footer";
import { resolveLegacyQr } from "@/lib/legacy-qr-aliases";

export default function StampPage() {
  return (
    <Suspense fallback={<Loading />}>
      <StampView />
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

interface StampEvent {
  shop_id: string | null;
  shop_code: string | null;
  stamped_at: string;
}

interface StampInfo {
  shop_name: string;
  card_name: string;
  total_stamps: number;
  mid_stamps: number | null;
  current_stamps: number;
  completed_count: number;
  events?: StampEvent[];
}

interface ScanResult {
  success?: boolean;
  shop_name?: string;
  shop_code?: string | null;
  current_stamps?: number;
  total_stamps?: number;
  mid_stamps?: number | null;
  reward_type?: "none" | "mid" | "full";
  reward_message?: string;
  error?: string;
  error_ja?: string;
}

type PageStatus = "loading" | "no_uid" | "ready" | "scanning" | "granting" | "success" | "already" | "error";

function StampView() {
  const params = useSearchParams();
  const [uid, setUid] = useState<string | null>(null);
  const [info, setInfo] = useState<StampInfo | null>(null);
  const [status, setStatus] = useState<PageStatus>("loading");
  const [scannerActive, setScannerActive] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  // uid 取得: ?uid= → sessionStorage → /l dispatcher にリダイレクト（LIFF一元化）
  useEffect(() => {
    const urlUid = params.get("uid");
    if (urlUid) {
      sessionStorage.setItem("repitol_line_user_id", urlUid);
      setUid(urlUid);
      return;
    }
    const stored = sessionStorage.getItem("repitol_line_user_id");
    if (stored) {
      setUid(stored);
      return;
    }
    // LIFF endpoint が /stamp だった場合、?to= が指定されていればそれを /l に引き継ぐ
    const to = params.get("to");
    const target = to === "coupon" ? "coupon" : "stamp";
    window.location.href = `/l?to=${target}`;
  }, [params]);

  // スタンプ情報取得
  const loadInfo = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(`/api/stamps/info?line_user_id=${encodeURIComponent(uid)}`);
      if (!res.ok) {
        setStatus("ready");
        return;
      }
      const data = await res.json();
      setInfo(data);
      setStatus("ready");
    } catch {
      setStatus("ready");
    }
  }, [uid]);

  useEffect(() => {
    if (uid) loadInfo();
  }, [uid, loadInfo]);

  // QR内容から shop_code 抽出 (例: https://repitol.vercel.app/s/shop_a)
  function extractShopCode(text: string): string | null {
    const trimmed = text.trim();
    // 新形式: URL 方式 (https://repitol.vercel.app/s/{code})
    const m = trimmed.match(/\/s\/([a-z0-9_-]+)/i);
    if (m) return m[1];
    // 旧形式: STAMP:{UUID} → shop_code 解決 (店頭に貼ってある旧 QR 互換)
    const legacy = resolveLegacyQr(trimmed);
    if (legacy) return legacy;
    // 単純な code 形式 (例: "shop_a") も許容
    if (/^[a-z0-9_-]{2,32}$/i.test(trimmed)) return trimmed;
    return null;
  }

  // QRコード読み取り処理（スタンプ付与）
  const grantStamp = useCallback(async (shopCode: string) => {
    if (!uid) return;
    setStatus("granting");
    try {
      const res = await fetch("/api/stamps/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_code: shopCode, line_user_id: uid }),
      });
      const data: ScanResult = await res.json();
      if (res.status === 429) {
        setErrorMsg(data.error_ja ?? "前回のスタンプから時間が空いていません");
        setStatus("already");
        return;
      }
      if (!res.ok) {
        setErrorMsg(data.error_ja ?? data.error ?? "エラーが発生しました");
        setStatus("error");
        return;
      }
      setResult(data);
      setStatus("success");
    } catch {
      setErrorMsg("通信エラー");
      setStatus("error");
    }
  }, [uid]);

  // ① LIFF scanCodeV2 (LINE 公式スキャナ・最優先)
  async function tryLiffScan(): Promise<boolean> {
    try {
      const liff = (await import("@line/liff")).default;
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      if (!liffId) return false;
      if (!liff.id) await liff.init({ liffId });
      if (!liff.isInClient?.()) return false;
      if (typeof liff.scanCodeV2 !== "function") return false;
      const r = await liff.scanCodeV2();
      const value = (r?.value ?? "").trim();
      if (!value) return false;
      const code = extractShopCode(value);
      if (code) {
        await grantStamp(code);
      } else {
        setErrorMsg(`このQRは対応していません（${value.substring(0, 40)}）`);
        setStatus("error");
      }
      return true;
    } catch (err) {
      console.warn("LIFF scanCodeV2 unavailable:", err);
      return false;
    }
  }

  // ② html5-qrcode (ブラウザカメラ・LIFF失敗時フォールバック)
  async function tryBrowserCamera(): Promise<boolean> {
    setScannerActive(true);
    return new Promise<boolean>((resolve) => {
      setTimeout(async () => {
        try {
          const { Html5Qrcode } = await import("html5-qrcode");
          const scanner = new Html5Qrcode("qr-reader");
          scannerRef.current = scanner;
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 240, height: 240 } },
            (decoded) => {
              const code = extractShopCode(decoded);
              scanner.stop().catch(() => {});
              scannerRef.current = null;
              setScannerActive(false);
              if (code) {
                grantStamp(code);
              } else {
                setErrorMsg(`このQRは対応していません（${decoded.substring(0, 40)}）`);
                setStatus("error");
              }
              resolve(true);
            },
            () => {}
          );
        } catch (err) {
          console.error("html5-qrcode unavailable:", err);
          setScannerActive(false);
          resolve(false);
        }
      }, 100);
    });
  }

  // QRスキャナー起動（3段フォールバック）
  async function startScanner() {
    setErrorMsg("");
    // ① LIFF scanCodeV2
    if (await tryLiffScan()) return;
    // ② html5-qrcode
    if (await tryBrowserCamera()) return;
    // ③ 案内フォールバック
    setErrorMsg(
      "カメラを起動できませんでした。\n" +
      "スマホの標準カメラアプリで店頭のQRコードを直接読み取ってください（URLが開きます）。"
    );
    setStatus("error");
  }

  function stopScanner() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScannerActive(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-50 to-white">
      <header className="bg-orange-500 px-4 py-4 text-center text-white shadow-md">
        <h1 className="text-xl font-bold">{info?.shop_name ?? "スタンプカード"}</h1>
        {info && <p className="mt-1 text-sm text-orange-100">{info.card_name}</p>}
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-6">
        <div className="w-full max-w-sm space-y-6">
          {status === "loading" && (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            </div>
          )}

          {status === "no_uid" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">📱</div>
              <p className="text-sm text-gray-600">
                LINEのリッチメニューから<br />「スタンプを貯める」を開いてください。
              </p>
            </div>
          )}

          {(status === "ready" || status === "granting") && info && (
            <>
              <StampCardView info={info} />
              <div className="space-y-3">
                <button
                  onClick={startScanner}
                  disabled={status === "granting"}
                  className="w-full rounded-2xl bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
                >
                  📷 QRコードを読み取る
                </button>
                <p className="text-center text-xs text-gray-400">
                  1,000円以上のお会計時にスタンプがもらえます
                </p>
              </div>
              {status === "granting" && (
                <div className="flex justify-center py-4">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
                </div>
              )}
            </>
          )}

          {scannerActive && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-10">
              <div className="mx-4 w-full max-w-sm space-y-4 rounded-2xl bg-white p-4 shadow-2xl">
                <h2 className="text-center text-lg font-bold text-gray-800">
                  QRコードをかざしてください
                </h2>
                <div id="qr-reader" className="overflow-hidden rounded-xl" />
                <button onClick={stopScanner}
                        className="w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 font-bold text-gray-500">
                  キャンセル
                </button>
              </div>
            </div>
          )}

          {status === "success" && result && (
            <div
              className="rounded-2xl p-6 text-center shadow-lg bg-cover bg-center"
              style={{ backgroundImage: "url('/stamp/demo_restaurant/card_base.png')" }}
            >
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
                  <div className="mb-4 flex justify-center">
                    <StampAcquiredIcon shopCode={result.shop_code ?? null} />
                  </div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">スタンプ獲得!</h2>
                </>
              )}
              <p className="mt-4 text-3xl font-bold text-orange-600">
                {result.current_stamps}<span className="text-xl text-gray-500">/{result.total_stamps}</span>
              </p>
              <button onClick={() => { setResult(null); loadInfo(); }}
                      className="mt-4 w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500">
                戻る
              </button>
            </div>
          )}

          {status === "already" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">✅</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">本日は取得済みです</h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
              <button onClick={() => { setErrorMsg(""); loadInfo(); }}
                      className="mt-4 w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500">
                戻る
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">😢</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">エラー</h2>
              <p className="text-sm text-gray-500 whitespace-pre-line leading-relaxed">{errorMsg}</p>
              <button onClick={() => { setErrorMsg(""); loadInfo(); }}
                      className="mt-4 w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 font-bold text-orange-500">
                もう一度試す
              </button>
            </div>
          )}
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}

/**
 * スタンプ獲得直後に大きく表示する印影アイコン。
 * shop_code が判別できれば店舗別の印影画像、不明なら従来の星絵文字。
 */
function StampAcquiredIcon({ shopCode }: { shopCode: string | null }) {
  if (shopCode === "shop_a") {
    return (
      <Image
        src="/stamp/demo_restaurant/shop_a.png"
        alt="Shop Aスタンプ"
        width={240}
        height={240}
        sizes="96px"
        className="h-24 w-24 object-contain"
        priority
      />
    );
  }
  if (shopCode === "shop_b") {
    return (
      <Image
        src="/stamp/demo_restaurant/shop_b.png"
        alt="Shop Bスタンプ"
        width={240}
        height={240}
        sizes="96px"
        className="h-24 w-24 object-contain"
        priority
      />
    );
  }
  return <span className="text-6xl">⭐</span>;
}

/**
 * 押されたスタンプ1つを店舗別の印影画像で描画する。
 * - shop_code === "shop_a" → /stamp/demo_restaurant/shop_a.png
 * - shop_code === "shop_b"  → /stamp/demo_restaurant/shop_b.png
 * - shop_code が不明       → 白星（既存スタンプ復元・shop_id NULL のフォールバック）
 */
function StampShopOverlay({ event }: { event?: StampEvent }) {
  const code = event?.shop_code ?? null;
  let src: string | null = null;
  let alt = "";
  if (code === "shop_a") {
    src = "/stamp/demo_restaurant/shop_a.png";
    alt = "Shop A";
  } else if (code === "shop_b") {
    src = "/stamp/demo_restaurant/shop_b.png";
    alt = "Shop B";
  } else {
    return <span className="text-white">★</span>;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={120}
      height={120}
      sizes="40px"
      className="h-10 w-10 object-contain pointer-events-none select-none"
      draggable={false}
    />
  );
}

function StampCardView({ info }: { info: StampInfo }) {
  return (
    <div
      className="rounded-2xl p-6 shadow-lg bg-cover bg-center"
      style={{ backgroundImage: "url('/stamp/demo_restaurant/card_base.png')" }}
    >
      <div className="mb-4 text-center">
        <p className="text-sm text-gray-700">現在のスタンプ</p>
        <p className="text-3xl font-bold text-orange-600">
          {info.current_stamps}
          <span className="text-lg text-gray-500">/{info.total_stamps}</span>
        </p>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: info.total_stamps }, (_, i) => {
          const filled = i < info.current_stamps;
          const isMid = info.mid_stamps !== null && i === info.mid_stamps - 1;
          const isFinal = i === info.total_stamps - 1;
          const event = filled ? info.events?.[i] : undefined;
          const hasShopStamp = filled && (
            event?.shop_code === "shop_a" || event?.shop_code === "shop_b"
          );
          // 印影画像がある場合はオレンジの色面を消し、紙(白)を背景に印影をそのまま見せる。
          // 不明スタンプ(★)のときだけ従来のオレンジ円で塗りつぶす。
          const fillClass = filled
            ? (hasShopStamp
                ? "bg-white text-orange-700 shadow-md"
                : "bg-orange-500 text-white shadow-md")
            : "border-2 border-gray-200 bg-white text-gray-300";
          return (
            <div key={i}
                 className={`relative flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold transition-all
                   ${fillClass}
                   ${isMid && !filled ? "border-orange-300 border-dashed" : ""}
                   ${isFinal && !filled ? "border-red-300 border-dashed" : ""}`}>
              {filled
                ? <StampShopOverlay event={event} />
                : isMid ? <span className="text-xs text-orange-400">{info.mid_stamps}</span>
                : isFinal ? <span className="text-xs text-red-400">!</span> : i + 1}
            </div>
          );
        })}
      </div>
      {info.mid_stamps && info.current_stamps < info.mid_stamps && (
        <p className="mt-4 text-center text-sm text-orange-700 font-medium">
          あと{info.mid_stamps - info.current_stamps}個で中間特典!
        </p>
      )}
      {info.current_stamps < info.total_stamps && (
        <p className="mt-1 text-center text-sm text-gray-700">
          あと{info.total_stamps - info.current_stamps}個でコンプリート!
        </p>
      )}
      {info.completed_count > 0 && (
        <p className="mt-2 text-center text-xs text-gray-600">
          コンプリート回数: {info.completed_count}回
        </p>
      )}
    </div>
  );
}
