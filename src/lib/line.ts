/**
 * LINE Messaging API ユーティリティ
 */

export type LineMessage =
  | { type: "text"; text: string }
  | { type: "image"; originalContentUrl: string; previewImageUrl: string }
  | { type: "flex"; altText: string; contents: Record<string, unknown> };

interface LinePushResponse {
  success: boolean;
  error?: string;
}

// LINE03修正: リトライロジック追加
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

/**
 * LINE Messaging APIでプッシュメッセージを送信する
 */
export async function sendPushMessage(
  accessToken: string,
  lineUserId: string,
  messages: LineMessage[]
): Promise<LinePushResponse> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to: lineUserId,
          messages,
        }),
      });

      if (res.ok) {
        return { success: true };
      }

      // 429 Rate Limit or 5xx: retry
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }

      const body = await res.text();
      console.error("LINE push message error:", res.status, body);
      return { success: false, error: `${res.status}: ${body}` };
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        continue;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("LINE push message network error:", message);
      return { success: false, error: message };
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

/**
 * LINE Messaging APIでリプライメッセージを送信する（無料）
 */
export async function sendReplyMessage(
  accessToken: string,
  replyToken: string,
  messages: LineMessage[]
): Promise<LinePushResponse> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages,
      }),
    });

    if (res.ok) {
      return { success: true };
    }

    const body = await res.text();
    console.error("LINE reply message error:", res.status, body);
    return { success: false, error: `${res.status}: ${body}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LINE reply message network error:", message);
    return { success: false, error: message };
  }
}
