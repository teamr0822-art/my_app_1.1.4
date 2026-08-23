import { streamText, tool, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { getSpot } from "@/lib/spots";
import { CHAT_MODEL, hasGeminiKey } from "@/lib/ai";
import { searchWikipedia } from "@/lib/wikipedia";

export const maxDuration = 30;

function fallbackRoute(nearby: { name: string; grounding: string }[] = []) {
  const stops = nearby.slice(0, 5);
  if (!stops.length) return "候補スポットがありません。地域や出発地を指定してください。";
  return [
    "AI接続を確認できなかったため、登録済みスポットから概算ルートを作成しました。",
    "",
    "立ち寄り順",
    ...stops.map((spot, index) => `${index + 1}. ${spot.name}`),
    "",
    "合計距離・時間: 概算（道路状況で変わります）",
    "移動手段: 徒歩を基本にしています。",
    "途中で気分が変わったら、「短くする」「次を変更する」と入力してください。",
  ].join("\n");
}

/**
 * Lets the guide look things up on Japanese Wikipedia when the answer is not
 * in the provided material. The model receives the article extract and must
 * answer from it, citing Wikipedia as the source.
 */
const wikipediaTool = tool({
  description:
    "案内資料に載っていない事柄について、日本語版ウィキペディアで調べる。歴史上の人物・出来事・地名・専門用語など、確かな情報が必要なときに使う。",
  inputSchema: z.object({
    query: z
      .string()
      .describe("調べたい語句やトピック（例: 山内一豊、よさこい祭り、横穴式石室）"),
  }),
  execute: async ({ query }) => {
    console.log("[v0] searchWikipedia called with:", query);
    const r = await searchWikipedia(query);
    if (!r) {
      return { found: false as const, note: "関連する記事が見つかりませんでした。" };
    }
    return { found: true as const, title: r.title, extract: r.extract, url: r.url };
  },
});

const MODEL = CHAT_MODEL;

type Body = {
  messages: ModelMessage[];
  spotId?: string;
  mode?: "spot" | "companion" | "route";
  nearby?: { name: string; grounding: string }[];
};

export async function POST(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }
  const { messages, spotId, mode = "spot", nearby } = body;
  if (!Array.isArray(messages)) {
    return new Response("messages must be an array", { status: 400 });
  }

  let system: string;

  if (mode === "route") {
    const context = nearby?.length ? nearby.map((s, i) => `${i + 1}. ${s.name}: ${s.grounding}`).join("\n") : "候補スポットなし";
    system = [
      "あなたは日本の文化財をめぐる観光ルート作成AIです。日本語で答えてください。",
      "利用者の条件と候補スポットだけを根拠に、無理のない1つのルートを提案します。",
      "候補にないスポットを作らず、距離や時間は必ず『概算』と書いてください。",
      "条件が不足して安全・実行可能な提案ができない場合は、勝手に補完せず確認質問を1つだけ返してください。",
      "回答形式: ルート名 / 立ち寄り順 / 概算の合計距離・時間 / 各区間の移動手段 / 途中変更の案内 / 注意事項。",
      "利用者は途中で気分や条件を変えます。変更依頼には、現在の条件を確認して柔軟に組み直してください。",
      "候補スポット一覧:\n" + context,
    ].join("\n");
  } else if (mode === "companion") {
    const context =
      nearby && nearby.length
        ? nearby
            .map((s) => `【${s.name}】\n${s.grounding}`)
            .join("\n\n")
        : "近くに登録された文化財の情報はありません。";
    system = [
      "あなたは高知市のまち歩きに寄り添うAIコンパニオンです。",
      "利用者と歩きながら、気さくに雑談する相棒として日本語で話します。",
      "以下は近くの文化財の情報です。話題に関係すれば自然に触れてください。",
      "",
      context,
      "",
      "【話し方のルール】",
      "- フレンドリーで親しみやすい口調（です・ます調をベースに、少しくだけてよい）。",
      "- 音声で聞くことを前提に、1〜3文程度で簡潔に。箇条書きや記号は使わない。",
      "- 上記の文化財情報にない事柄で、確かな知識が必要なときは searchWikipedia で調べてから答える。",
      "- 「調べてみますね」などの検索の途中経過は口に出さず、最終的な答えだけを一度で簡潔に話す。",
      "- 調べて答えたときは、最後に出典を一言添える（例:「〜だそうです。（出典: ウィキペディア）」）。",
      "- 調べても分からないことは正直に「わからない」と伝える。作り話をしない。",
    ].join("\n");
  } else {
    const spot = spotId ? getSpot(spotId) : undefined;
    if (!spot) {
      return new Response("Unknown spot", { status: 400 });
    }
    system = [
      `あなたは高知市の文化財「${spot.name}」の案内をするAI音声ガイドです。`,
      "訪れた人の質問に、下記の資料にもとづいて日本語で答えます。",
      "",
      "【このスポットの資料】",
      `名称: ${spot.name}`,
      `指定: ${spot.designation}`,
      `分類: ${spot.category}`,
      `時代: ${spot.era}`,
      `所在地: ${spot.address}`,
      `解説: ${spot.grounding}`,
      `出典: ${spot.sources.join(" / ")}`,
      "",
      "【回答のルール】",
      "- まず上記資料の範囲で答える。",
      "- 資料に載っていない事柄（関連する歴史上の人物・出来事・専門用語など）を",
      "  尋ねられたら、searchWikipedia で調べてから答えてよい。",
      "- 音声で聞くことを前提に、2〜4文程度で簡潔に。箇条書きや記号は使わない。",
      "- 親しみやすい、やわらかい語り口（です・ます調）。",
      `- 事実関係を答えたときは、最後に出典を一言添える（資料に基づくときは「（出典: ${spot.sources[0]}）」、`,
      "  ウィキペディアで調べたときは「（出典: ウィキペディア）」のように）。",
      "- 調べても分からないことは正直に伝え、作り話はしない。",
      "- 挨拶や雑談にも自然に応じてよい。",
    ].join("\n");
  }

  // Without a Gemini API key we cannot reach the model at all. For route mode
  // we still return something usable; other modes report the misconfiguration.
  if (!hasGeminiKey) {
    if (mode === "route") {
      return new Response(fallbackRoute(nearby), {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(
      "AIキーが設定されていません。環境変数 GEMINI_API_KEY を設定してください。",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  // Capture the underlying provider error so a failure is visible to the user
  // instead of silently returning an empty 200 (which reads as "the AI said
  // nothing"). Rate limits and quota errors are the common cause.
  let failure: string | null = null;

  const result = streamText({
    model: MODEL,
    system,
    messages,
    tools: { searchWikipedia: wikipediaTool },
    // Allow the model to call the tool and then answer with the result.
    stopWhen: stepCountIs(4),
    maxOutputTokens: 2048,
    providerOptions: {
      google: {
        // Gemini 2.5 "thinking" is on by default. On longer prompts it spent
        // the whole response on internal thought parts and streamed no text,
        // which surfaced as an empty answer. This app needs short, grounded
        // replies, so thinking is turned off.
        thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
      },
    },
    onError: ({ error }) => {
      failure = error instanceof Error ? error.message : String(error);
      console.error("[v0] chat streamText error:", error);
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      try {
        for await (const chunk of result.textStream) {
          wrote = true;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        failure = failure ?? (err instanceof Error ? err.message : String(err));
      }
      if (!wrote) {
        const reason = describeFailure(failure);
        controller.enqueue(
          encoder.encode(
            mode === "route"
              ? `${reason}\n\n${fallbackRoute(nearby)}`
              : reason,
          ),
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Turns a provider error into something a visitor can act on. */
function describeFailure(raw: string | null): string {
  const text = (raw ?? "").toLowerCase();
  if (!raw) return "AIから応答がありませんでした。少し時間をおいて、もう一度お試しください。";
  if (text.includes("429") || text.includes("quota") || text.includes("rate limit") || text.includes("resource_exhausted")) {
    return "AIの利用上限に達しました（無料枠の制限）。しばらく待ってからもう一度お試しください。";
  }
  if (text.includes("401") || text.includes("403") || text.includes("api key") || text.includes("permission")) {
    return "AIキーが無効か、権限がありません。GEMINI_API_KEY の設定を確認してください。";
  }
  return `AIの応答に失敗しました（${raw.slice(0, 200)}）`;
}
