"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { resolveLegacyQr } from "@/lib/legacy-qr-aliases";

interface StampResult {
  success: boolean;
  shop_name?: string;
  current_stamps?: number;
  total_stamps?: number;
  mid_stamps?: number | null;
  completed_count?: number;
  reward_type?: "none" | "mid" | "full";
  reward_message?: string;
  visit_count?: number;
  error?: string;
  error_ja?: string;
}

interface StampInfo {
  shop_name: string;
  card_name: string;
  total_stamps: number;
  mid_stamps: number | null;
  current_stamps: number;
  completed_count: number;
}

// スタンプ表示コンポーネント（親の外に定義してレンダー毎の再生成を防止）
function StampDisplay({
  current,
  total,
  mid,
}: {
  current: number;
  total: number;
  mid: number | null;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {Array.from({ length: total }, (_, i) => {
        const filled = i < current;
        const isMid = mid !== null && i === mid - 1;
        const isFinal = i === total - 1;

        return (
          <div
            key={i}
            className={`
              flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold
              transition-all duration-300
              ${filled
                ? "bg-orange-500 text-white shadow-md"
                : "border-2 border-gray-200 bg-white text-gray-300"
              }
              ${isMid && !filled ? "border-orange-300 border-dashed" : ""}
              ${isFinal && !filled ? "border-red-300 border-dashed" : ""}
            `}
          >
            {filled ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10 2l2.5 5.1L18 8l-4 3.9.9 5.6L10 14.8l-4.9 2.7.9-5.6L2 8l5.5-.9z" />
              </svg>
            ) : isMid ? (
              <span className="text-xs text-orange-400">{mid}</span>
            ) : isFinal ? (
              <span className="text-xs text-red-400">!</span>
            ) : (
              i + 1
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function StampPage() {
  const params = useParams();
  const shopId = params.code as string;

  const [status, setStatus] = useState<"loading" | "ready" | "scanning" | "success" | "error" | "already">("loading");
  const [stampInfo, setStampInfo] = useState<StampInfo | null>(null);
  const [result, setResult] = useState<StampResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [liffReady, setLiffReady] = useState(false);
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [isLineAndroid, setIsLineAndroid] = useState(false);
  const [liffScanAvailable, setLiffScanAvailable] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);

  // LINE内ブラウザ（Android）検出
  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Line/i.test(ua) && /Android/i.test(ua)) {
      setIsLineAndroid(true);
    }
  }, []);

  // LIFF init + scanCodeV2 利用可否判定
  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) return;

    let cancelled = false;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        if (!liff.id) {
          await liff.init({ liffId });
        }
        if (cancelled) return;
        const inClient = liff.isInClient?.() ?? false;
        const hasScan = typeof liff.scanCodeV2 === "function";
        if (inClient && hasScan) {
          setLiffScanAvailable(true);
        }
      } catch (err) {
        console.error("LIFF init error:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // LIFF初期化
  useEffect(() => {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) {
      // LIFF未設定の場合はデモモードで表示
      setStatus("ready");
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);

    // URLパラメータにuidがあればそれを使う（Webhook経由のリンク）
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

  // ショップ・スタンプ情報を取得
  const loadStampInfo = useCallback(async () => {
    if (!lineUserId || !shopId) return;

    try {
      const res = await fetch(`/api/stamps/info?shop_id=${shopId}&line_user_id=${lineUserId}`);
      if (res.ok) {
        const data = await res.json();
        setStampInfo(data);
      }
    } catch {
      // 初回訪問で情報がない場合は無視
    }
  }, [lineUserId, shopId]);

  useEffect(() => {
    if (lineUserId) loadStampInfo();
  }, [lineUserId, loadStampInfo]);

  // LIFF scanCodeV2: LINEアプリのネイティブカメラを起動
  async function scanWithLiff() {
    try {
      const liff = (await import("@line/liff")).default;
      if (typeof liff.scanCodeV2 !== "function") {
        setErrorMsg("このバージョンのLINEではQRスキャンに対応していません。最新版に更新してください。");
        setStatus("error");
        return;
      }
      const result = await liff.scanCodeV2();
      const value = (result?.value ?? "").trim();
      if (!value) {
        setErrorMsg("QRコードを読み取れませんでした。もう一度お試しください。");
        setStatus("error");
        return;
      }
      // レガシー UUID を最優先で判定 (古いリッチメニュー経由の shopId 衝突を回避)
      const legacyShopCode = resolveLegacyQr(value);
      if (legacyShopCode) {
        await handleScan({ legacyShopCode });
        return;
      }
      const expected = `STAMP:${shopId}`;
      if (value === expected || value.includes(shopId)) {
        await handleScan();
        return;
      }
      setErrorMsg(`このQRコードは対応していません（読取: ${value}）`);
      setStatus("error");
    } catch (err) {
      console.error("scanCodeV2 error:", err);
      setErrorMsg("QRスキャナーを起動できませんでした。LINEアプリを最新版に更新してお試しください。");
      setStatus("error");
    }
  }

  // QRスキャナー開始
  async function startScanner() {
    setScannerActive(true);
    // 少し待ってからスキャナーを初期化（DOM描画待ち）
    setTimeout(async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const scanner = new Html5Qrcode("qr-reader");
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // QRコード読み取り成功
            const trimmed = decodedText.trim();
            const expected = `STAMP:${shopId}`;
            const legacyShopCode = resolveLegacyQr(trimmed);
            // レガシー UUID を最優先 (古いリッチメニュー経由の shopId 衝突を回避)
            if (legacyShopCode) {
              scanner.stop().catch(() => {});
              setScannerActive(false);
              scannerRef.current = null;
              handleScan({ legacyShopCode });
            } else if (trimmed === expected || trimmed.includes(shopId)) {
              scanner.stop().catch(() => {});
              setScannerActive(false);
              scannerRef.current = null;
              handleScan(); // スタンプ付与
            } else {
              // 不正なQRコード
              scanner.stop().catch(() => {});
              setScannerActive(false);
              scannerRef.current = null;
              setErrorMsg(`このQRコードは対応していません（読取: ${trimmed}）`);
              setStatus("error");
            }
          },
          () => {} // エラーは無視（スキャン継続）
        );
      } catch (err) {
        console.error("Scanner error:", err);
        setScannerActive(false);
        setErrorMsg("カメラを起動できませんでした。カメラの権限を許可してください。");
        setStatus("error");
      }
    }, 100);
  }

  // QRスキャナー停止
  function stopScanner() {
    if (scannerRef.current) {
      scannerRef.current.stop().catch(() => {});
      scannerRef.current = null;
    }
    setScannerActive(false);
  }

  // LINE Android 用: Chrome に強制遷移（Intent URL）
  function openInChrome() {
    const url = window.location.href;
    // 1. まず LIFF の external:true で外部ブラウザを試みる
    try {
      const w = window as unknown as { liff?: { openWindow?: (opt: { url: string; external?: boolean }) => void } };
      if (w.liff?.openWindow) {
        w.liff.openWindow({ url, external: true });
        return;
      }
    } catch {}
    // 2. Android Intent URL で Chrome を直接起動
    const stripped = url.replace(/^https?:\/\//, "");
    const intentUrl = `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    window.location.href = intentUrl;
  }

  // フォールバック: 画像ファイルから QR を読み取る（LINE Android でも動く）
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader-hidden", { verbose: false, formatsToSupport: undefined } as unknown as boolean);
      const decoded = await scanner.scanFile(file, false);
      const trimmed = decoded.trim();
      // レガシー UUID を最優先
      const legacyShopCode = resolveLegacyQr(trimmed);
      if (legacyShopCode) {
        await handleScan({ legacyShopCode });
        return;
      }
      if (trimmed === `STAMP:${shopId}` || trimmed.includes(shopId)) {
        await handleScan();
        return;
      }
      setErrorMsg(`このQRコードは対応していません（読取: ${trimmed}）`);
      setStatus("error");
    } catch (err) {
      console.error("File QR scan error:", err);
      setErrorMsg("QRコードの読み取りに失敗しました。はっきり写った写真で再度お試しください。");
      setStatus("error");
    } finally {
      // input reset (同じ画像を再送できるように)
      e.target.value = "";
    }
  }

  async function handleScan(opts?: { legacyShopCode?: string }) {
    if (!lineUserId) {
      setErrorMsg("LINE認証が必要です。LINEアプリからアクセスしてください。");
      setStatus("error");
      return;
    }

    setStatus("scanning");

    try {
      const body: Record<string, string> = opts?.legacyShopCode
        ? { shop_code: opts.legacyShopCode, line_user_id: lineUserId }
        : { shop_id: shopId, line_user_id: lineUserId };

      // LIFFトークンがあれば送信
      if (liffReady) {
        try {
          const liff = (await import("@line/liff")).default;
          const token = liff.getIDToken();
          if (token) body.liff_token = token;
        } catch {
          // トークン取得失敗は無視
        }
      }

      const res = await fetch("/api/stamps/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data: StampResult = await res.json();

      if (res.status === 429) {
        setStatus("already");
        setErrorMsg(data.error_ja ?? "前回のスタンプから12時間経っていません。");
        return;
      }

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error_ja ?? (data as unknown as Record<string, string>).detail ?? data.error ?? "エラーが発生しました。");
        return;
      }

      setResult(data);
      setStatus("success");
    } catch {
      setStatus("error");
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-orange-50 to-white">
      {/* Header */}
      <header className="bg-orange-500 px-4 py-4 text-center text-white shadow-md">
        <h1 className="text-xl font-bold">
          {stampInfo?.shop_name ?? "スタンプカード"}
        </h1>
        {stampInfo && (
          <p className="mt-1 text-sm text-orange-100">{stampInfo.card_name}</p>
        )}
      </header>

      <main className="flex flex-1 flex-col items-center px-4 py-6">
        {/* ローディング */}
        {status === "loading" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
          </div>
        )}

        {/* スタンプ表示 */}
        {status === "ready" && (
          <div className="w-full max-w-sm space-y-6">
            {stampInfo && (
              <div
                className="rounded-2xl p-6 shadow-lg bg-cover bg-center"
                style={{ backgroundImage: "url('/stamp/demo_restaurant/card_base.png')" }}
              >
                <div className="mb-4 text-center">
                  <p className="text-sm text-gray-700">現在のスタンプ</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {stampInfo.current_stamps}
                    <span className="text-lg text-gray-500">/{stampInfo.total_stamps}</span>
                  </p>
                </div>

                <StampDisplay
                  current={stampInfo.current_stamps}
                  total={stampInfo.total_stamps}
                  mid={stampInfo.mid_stamps}
                />

                {stampInfo.mid_stamps && stampInfo.current_stamps < stampInfo.mid_stamps && (
                  <p className="mt-4 text-center text-sm text-orange-700 font-medium">
                    あと{stampInfo.mid_stamps - stampInfo.current_stamps}個で中間特典!
                  </p>
                )}
                {stampInfo.current_stamps < stampInfo.total_stamps && (
                  <p className="mt-1 text-center text-sm text-gray-700">
                    あと{stampInfo.total_stamps - stampInfo.current_stamps}個でコンプリート!
                  </p>
                )}
                {stampInfo.completed_count > 0 && (
                  <p className="mt-2 text-center text-xs text-gray-600">
                    コンプリート回数: {stampInfo.completed_count}回
                  </p>
                )}
              </div>
            )}

            {lineUserId ? (
              <>
                {liffScanAvailable ? (
                  <div className="space-y-3">
                    <button
                      onClick={scanWithLiff}
                      className="w-full rounded-2xl bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-orange-600"
                    >
                      📷 QRコードを読み取ってスタンプをもらう
                    </button>
                    {isLineAndroid && (
                      <details className="rounded-xl bg-white p-3 shadow-sm">
                        <summary className="cursor-pointer text-xs text-gray-500">
                          カメラが起動しない場合（写真から読取）
                        </summary>
                        <div className="relative mt-3">
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                          <button
                            type="button"
                            className="w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 text-sm font-bold text-orange-500 active:scale-95 pointer-events-none"
                          >
                            📸 QRコードを撮影して読み取り
                          </button>
                        </div>
                        <div id="qr-reader-hidden" className="hidden" />
                      </details>
                    )}
                  </div>
                ) : isLineAndroid ? (
                  <div className="rounded-2xl bg-white p-5 shadow-lg space-y-4 text-center">
                    <div className="text-4xl">📱</div>
                    <p className="text-sm font-bold text-gray-800">
                      Android LINE内ブラウザではカメラが起動できません
                    </p>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Chromeで開くか、QRを撮影した写真をアップロードしてください
                    </p>
                    <button
                      onClick={openInChrome}
                      className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white active:scale-95"
                    >
                      🌐 Chromeで開く（推奨）
                    </button>
                    <div className="relative">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <button
                        type="button"
                        className="w-full rounded-xl border-2 border-orange-500 bg-white px-4 py-3 text-sm font-bold text-orange-500 active:scale-95 pointer-events-none"
                      >
                        📸 QRコードを撮影して読み取り
                      </button>
                    </div>
                    {/* ファイル読取用の不可視コンテナ */}
                    <div id="qr-reader-hidden" className="hidden" />
                  </div>
                ) : (
                  <button
                    onClick={startScanner}
                    className="w-full rounded-2xl bg-orange-500 px-6 py-4 text-lg font-bold text-white shadow-lg transition-all active:scale-95 hover:bg-orange-600"
                  >
                    QRコードを読み取ってスタンプをもらう
                  </button>
                )}
                <p className="text-center text-xs text-gray-400">
                  1,000円以上のお会計時に1日1回スタンプがもらえます
                </p>

                {/* QRスキャナー オーバーレイ */}
                {scannerActive && (
                  <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 pt-12">
                    <div className="w-full max-w-sm mx-4 rounded-2xl bg-white p-4 shadow-2xl space-y-4">
                      <h2 className="text-center text-lg font-bold text-gray-800">
                        QRコードをかざしてください
                      </h2>
                      <div id="qr-reader" className="overflow-hidden rounded-xl" />
                      <button
                        onClick={stopScanner}
                        className="w-full rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-500 active:scale-95"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl bg-orange-50 p-4 text-center">
                <p className="text-sm text-orange-700 font-medium">
                  スタンプを受け取るには、まずLINEのDemo Restaurantトーク画面で「スタンプ」と送信してください
                </p>
              </div>
            )}
          </div>
        )}

        {/* スキャン中 */}
        {status === "scanning" && (
          <div className="flex flex-1 flex-col items-center justify-center space-y-4">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-500" />
            <p className="text-gray-500">スタンプを確認中...</p>
          </div>
        )}

        {/* 成功 */}
        {status === "success" && result && (
          <div className="w-full max-w-sm space-y-6">
            <div
              className="rounded-2xl p-6 text-center shadow-lg bg-cover bg-center"
              style={{ backgroundImage: "url('/stamp/demo_restaurant/card_base.png')" }}
            >
              {result.reward_type === "full" ? (
                <>
                  <div className="mb-4 text-6xl">🎉</div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">
                    コンプリート!
                  </h2>
                  <p className="text-gray-700">{result.reward_message}</p>
                </>
              ) : result.reward_type === "mid" ? (
                <>
                  <div className="mb-4 text-6xl">🎊</div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">
                    中間特典ゲット!
                  </h2>
                  <p className="text-gray-700">{result.reward_message}</p>
                </>
              ) : (
                <>
                  <div className="mb-4 text-6xl">⭐</div>
                  <h2 className="mb-2 text-xl font-bold text-orange-600">
                    スタンプ獲得!
                  </h2>
                </>
              )}

              <div className="mt-4">
                <StampDisplay
                  current={result.current_stamps ?? 0}
                  total={result.total_stamps ?? 10}
                  mid={result.mid_stamps ?? null}
                />
              </div>

              <p className="mt-4 text-2xl font-bold text-orange-600">
                {result.current_stamps}/{result.total_stamps}
              </p>
            </div>

            <button
              onClick={() => {
                setStatus("ready");
                loadStampInfo();
              }}
              className="w-full rounded-2xl border-2 border-orange-500 bg-white px-6 py-3 font-bold text-orange-500 transition-all hover:bg-orange-50"
            >
              戻る
            </button>
          </div>
        )}

        {/* 本日スタンプ済み */}
        {status === "already" && (
          <div className="w-full max-w-sm space-y-6">
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">✅</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">
                本日のスタンプは取得済みです
              </h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
            <button
              onClick={() => {
                setStatus("ready");
                loadStampInfo();
              }}
              className="w-full rounded-2xl border-2 border-orange-500 bg-white px-6 py-3 font-bold text-orange-500"
            >
              戻る
            </button>
          </div>
        )}

        {/* エラー */}
        {status === "error" && (
          <div className="w-full max-w-sm space-y-6">
            <div className="rounded-2xl bg-white p-6 text-center shadow-lg">
              <div className="mb-4 text-5xl">😢</div>
              <h2 className="mb-2 text-lg font-bold text-gray-700">エラー</h2>
              <p className="text-sm text-gray-500 break-all">{errorMsg}</p>
              {errorMsg.includes("読取:") && (
                <textarea
                  readOnly
                  value={errorMsg}
                  onClick={(e) => e.currentTarget.select()}
                  className="mt-3 w-full rounded border border-gray-200 p-2 text-[10px] font-mono"
                  rows={3}
                />
              )}
              <p className="mt-3 text-[10px] text-gray-300">legacy-qr v3</p>
            </div>
            <button
              onClick={() => setStatus("ready")}
              className="w-full rounded-2xl border-2 border-orange-500 bg-white px-6 py-3 font-bold text-orange-500"
            >
              もう一度試す
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
