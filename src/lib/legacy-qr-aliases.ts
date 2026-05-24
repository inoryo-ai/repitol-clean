/**
 * 旧 QR コード (UUID 形式) から現行 shop_code へのマッピング。
 *
 * 2026-04-25 の大規模改修で QR を URL 形式 (https://repitol.vercel.app/s/{code})
 * に切り替えたが、店頭には旧形式の QR (`STAMP:{UUID}`) がまだ貼ってあるため、
 * 互換のためにこのマッピングを残す。
 *
 * 店頭の旧 QR をすべて新 URL 形式に差し替えたら、このファイルは削除可能。
 *
 * 新規 QR は `docs/_scripts/gen_shop_qrcodes.py` で URL 形式を発行すること。
 */
export const LEGACY_QR_UUID_TO_SHOP_CODE: Readonly<Record<string, string>> = {
  // Shop A 旧 QR (標準 36 桁 UUID)
  "11111111-1111-1111-1111-111111111111": "shop_a",
  // Shop B 旧 QR (標準 36 桁 UUID)
  "22222222-2222-2222-2222-222222222222": "shop_b",
};

const STAMP_PREFIX = "STAMP:";

// 旧 QR はプレースホルダー UUID (全て同じ数字の繰り返し) で焼かれているため、
// LIFF QR スキャナーが読取値をどう変形しても先頭文字 1 文字で判別できる。
// 新 QR は URL 形式 (https://repitol.vercel.app/s/...) なので衝突しない。
const FIRST_CHAR_TO_SHOP: Readonly<Record<string, string>> = {
  "1": "shop_a",
  "2": "shop_b",
};

/**
 * QR 読取値からレガシー UUID を抽出し、対応する shop_code を返す。
 * 該当しなければ null。
 *
 * 例:
 *   "STAMP:11111111-1111-1111-1111-111111111111" → "shop_a" (完全一致)
 *   "STAMP:111111-1111-..."                       → "shop_a" (パターン一致)
 *   "STAMP:33333..."                              → null
 *   "https://repitol.vercel.app/s/shop_a"         → null (新形式は呼び元で処理)
 */
export function resolveLegacyQr(rawValue: string): string | null {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed.startsWith(STAMP_PREFIX)) return null;
  const uuid = trimmed.slice(STAMP_PREFIX.length);
  // 完全一致を優先
  const exact = LEGACY_QR_UUID_TO_SHOP_CODE[uuid];
  if (exact) return exact;
  // 先頭 1 文字で判別 (旧 QR は全て同じ数字の繰り返しなので最も寛容)
  return FIRST_CHAR_TO_SHOP[uuid.charAt(0)] ?? null;
}
