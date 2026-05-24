"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED = "image/png,image/jpeg,image/jpg,image/webp,image/gif";
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

interface ImageUploaderProps {
  /** 現在の画像URL（未設定なら null） */
  value: string | null;
  /** アップロード完了時の URL またはクリア時の null を受け取る */
  onChange: (url: string | null) => void;
  /** バケット内の保存先プレフィックス。例: "broadcast" / "menu" / "coupons" */
  folder: string;
  /** 直接URL貼付けも許可するか（後方互換用、デフォルト false） */
  allowManualUrl?: boolean;
  /** プレビュー画像の最大幅クラス（デフォルト max-w-xs） */
  previewClassName?: string;
  disabled?: boolean;
}

/**
 * Supabase Storage (`media` バケット) に画像をアップロードする UI コンポーネント。
 * - ファイル選択・ドラッグ&ドロップ両対応
 * - 進捗表示・エラー表示
 * - クリアボタン
 * - allowManualUrl=true で URL 直貼付け欄も併用可
 */
export function ImageUploader({
  value, onChange, folder,
  allowManualUrl = false,
  previewClassName = "max-w-xs",
  disabled = false,
}: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const upload = useCallback(async (file: File) => {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルのみアップロードできます");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`ファイルサイズは ${Math.round(MAX_BYTES / 1024 / 1024)}MB 以下にしてください`);
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const ts = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${folder}/${ts}_${rand}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media")
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type,
        });
      if (upErr) {
        setError(`アップロード失敗: ${upErr.message}`);
        return;
      }
      const { data: pub } = supabase.storage.from("media").getPublicUrl(path);
      onChange(pub.publicUrl);
    } catch (e) {
      setError("通信エラーが発生しました");
      console.error(e);
    } finally {
      setUploading(false);
    }
  }, [folder, onChange]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload(file);
    // 同じファイルを連続選択できるようにリセット
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED}
        onChange={handleFile}
        className="hidden"
        disabled={disabled || uploading}
      />

      {value ? (
        <div className="space-y-2">
          <div className={`relative ${previewClassName}`}>
            {/* プレビュー: 任意の縦横比に対応するため intrinsic レイアウト + 自動サイズ取得 */}
            <Image
              src={value}
              alt="プレビュー"
              width={400}
              height={400}
              unoptimized
              className="rounded-md border w-full h-auto object-contain"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              差し替え
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              className="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              削除
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          aria-disabled={disabled || uploading}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-6 text-sm transition-colors
            ${dragActive ? "border-orange-500 bg-orange-50" : "border-gray-300 hover:bg-muted"}
            ${(disabled || uploading) ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {uploading ? (
            <span className="text-muted-foreground">アップロード中...</span>
          ) : (
            <>
              <span className="font-medium">クリックして画像を選択</span>
              <span className="text-xs text-muted-foreground">またはここにドラッグ&ドロップ</span>
              <span className="text-xs text-muted-foreground">PNG / JPEG / WEBP / GIF（最大10MB）</span>
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {allowManualUrl && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">URL を直接入力する</summary>
          <input
            type="url"
            placeholder="https://..."
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled || uploading}
            className="mt-1 w-full rounded-md border px-2 py-1 text-sm"
          />
        </details>
      )}
    </div>
  );
}
