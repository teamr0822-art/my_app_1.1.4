import { generateText } from "ai";

import { CHAT_MODEL, CHAT_MODEL_ID, hasGeminiKey } from "@/lib/ai";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * 一時的な診断用エンドポイント。役目を終えたら削除してください。
 *
 * ブラウザで /api/diag を開くと、AIがつながらない原因が JSON で返ります。
 *
 * ■ 安全のために守っていること
 *   - APIキーの値は絶対に返しません。返すのは「あるか」「何文字か」
 *     「前後に空白や改行が混ざっていないか」「先頭4文字の形式が
 *     Google のキーらしいか」だけです。
 *   - Gemini からのエラー本文はそのまま返しますが、万一そこにキーが
 *     含まれていた場合に備えて伏せ字にしてから返します。
 *   - 何も書き換えません。読むだけです。
 */

/** キーらしき文字列を伏せる。エラー本文をそのまま出すための保険。 */
function redact(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza…[伏せ字]")
    .replace(/key=[^&\s"']+/gi, "key=[伏せ字]");
}

export async function GET() {
  const raw = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";
  const trimmed = raw.trim();

  const key = {
    見つかった変数:
      process.env.GEMINI_API_KEY !== undefined
        ? "GEMINI_API_KEY"
        : process.env.GOOGLE_GENERATIVE_AI_API_KEY !== undefined
          ? "GOOGLE_GENERATIVE_AI_API_KEY"
          : "どちらも未設定",
    値がある: raw.length > 0,
    文字数: raw.length,
    前後の空白や改行: raw.length !== trimmed.length ? "あり（要修正）" : "なし",
    先頭4文字: trimmed.slice(0, 4) || "(空)",
    // Google issues more than one key format ("AIza…" and the newer "AQ.…"),
    // so this is a note, not a verdict.
    キーの形式: trimmed.startsWith("AIza")
      ? "AIza形式"
      : trimmed.startsWith("AQ.")
        ? "AQ.形式（新しい方）"
        : "見慣れない形式",
    アプリがキーありと判定: hasGeminiKey,
  };

  // 環境変数の名前だけ一覧にする。値は一切読みません。
  const 環境変数の名前 = Object.keys(process.env)
    .filter((n) => /GEMINI|GOOGLE|AI_/i.test(n))
    .sort();

  if (!hasGeminiKey) {
    return Response.json(
      {
        結論: "キーがアプリまで届いていません。Vercelの環境変数を見直してください。",
        key,
        使っているモデル: CHAT_MODEL_ID,
        環境変数の名前,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // キーはある。ここから先は実際に Gemini を呼んで、返ってくるエラーを見る。
  const t0 = Date.now();
  try {
    const result = await generateText({
      model: CHAT_MODEL,
      prompt: "「はい」とだけ答えてください。",
      maxOutputTokens: 16,
      abortSignal: AbortSignal.timeout(15_000),
      providerOptions: {
        google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
      },
    });
    return Response.json(
      {
        結論: result.text.trim()
          ? "Geminiは正常に応答しました。AIガイドも動くはずです。"
          : "Geminiは応答しましたが本文が空でした。",
        かかった時間ms: Date.now() - t0,
        使っているモデル: CHAT_MODEL_ID,
        応答: result.text.slice(0, 100),
        key,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      {
        結論: "キーは届いていますが、Geminiの呼び出しが失敗しました。下のエラー本文が原因です。",
        かかった時間ms: Date.now() - t0,
        使っているモデル: CHAT_MODEL_ID,
        エラー: redact(message).slice(0, 1200),
        key,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
