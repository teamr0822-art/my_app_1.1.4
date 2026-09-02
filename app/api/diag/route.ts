import { generateText } from "ai";

import {
  CHAT_CANDIDATES,
  chatModel,
  hasAnyKey,
  hasGeminiKey,
  hasGroqKey,
  labelOf,
} from "@/lib/ai";

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
  const groqRaw = process.env.GROQ_API_KEY ?? "";
  const trimmed = raw.trim();

  const key = {
    Gemini: {
      値がある: raw.length > 0,
      文字数: raw.length,
      前後の空白や改行: raw.length !== trimmed.length ? "あり（要修正）" : "なし",
      先頭4文字: trimmed.slice(0, 4) || "(空)",
    },
    Groq: {
      値がある: groqRaw.length > 0,
      文字数: groqRaw.length,
      前後の空白や改行:
        groqRaw.length !== groqRaw.trim().length ? "あり（要修正）" : "なし",
      先頭4文字: groqRaw.trim().slice(0, 4) || "(空)",
    },
    使える設定: { Gemini: hasGeminiKey, Groq: hasGroqKey },
  };

  // 環境変数の名前だけ一覧にする。値は一切読みません。
  const 環境変数の名前 = Object.keys(process.env)
    .filter((n) => /GEMINI|GOOGLE|GROQ|AI_/i.test(n))
    .sort();

  if (!hasAnyKey || CHAT_CANDIDATES.length === 0) {
    return Response.json(
      {
        結論:
          "AIのキーが1つも届いていません。Vercelの環境変数に GEMINI_API_KEY か GROQ_API_KEY を設定してください。",
        key,
        環境変数の名前,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  // Ask every candidate the same tiny question, so the result says exactly
  // which models are usable right now rather than only the first one.
  const results = [];
  for (const candidate of CHAT_CANDIDATES) {
    const t0 = Date.now();
    try {
      const r = await generateText({
        model: chatModel(candidate),
        prompt: "「はい」とだけ答えてください。",
        maxOutputTokens: 32,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(10_000),
      });
      results.push({
        モデル: labelOf(candidate),
        状態: r.text.trim() ? "OK" : "応答が空",
        ms: Date.now() - t0,
        応答: r.text.trim().slice(0, 40),
      });
    } catch (err) {
      results.push({
        モデル: labelOf(candidate),
        状態: "NG",
        ms: Date.now() - t0,
        理由: redact(err instanceof Error ? err.message : String(err)).slice(0, 220),
      });
    }
  }

  const ok = results.filter((r) => r.状態 === "OK").map((r) => r.モデル);
  return Response.json(
    {
      結論: ok.length
        ? `使えるモデルがあります（${ok.join(" / ")}）。AIガイドも動きます。`
        : "どのモデルも応答しませんでした。下の理由を見てください。",
      使えるモデル: ok,
      個別の結果: results,
      key,
      環境変数の名前,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
