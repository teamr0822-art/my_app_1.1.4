import { streamText, generateText, tool, stepCountIs, type ModelMessage } from "ai";
import { z } from "zod";
import { areaOf, getSpot, type Spot } from "@/lib/spots";
import { CHAT_MODEL, hasGeminiKey } from "@/lib/ai";
import { searchWikipedia } from "@/lib/wikipedia";
import { rateLimit, clientKey } from "@/lib/rate-limit";

/**
 * The dataset covers Kochi, Hiroshima and Ibusuki, so the guide must never
 * introduce itself as a guide to whichever city happened to be first. The city
 * comes from the spot being discussed, or from the nearest candidate.
 */
function areaFromNearby(nearby?: NearbySpot[]): string {
  return nearby?.find((s) => s.city)?.city ?? "この街";
}

/** A candidate spot as the client sends it: name, source text, and its city. */
type NearbySpot = { name: string; grounding: string; city?: string };

export const maxDuration = 30;

/**
 * Source entries carry the page URL appended to the title. Spoken aloud that
 * becomes "エイチティーティーピーエス コロン スラッシュ…", so only the readable
 * label reaches the model.
 */
function citationLabel(source: string): string {
  return source.replace(/https?:\/\/[^\s、。）」』】]+/g, "").replace(/[\s　]+$/, "").trim();
}

function fallbackRoute(nearby: NearbySpot[] = []) {
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
 * Every spot ships with its own source material, so an AI outage does not have
 * to mean an empty screen: the guide simply reads the material it already has.
 * This is what keeps the app usable when the quota runs out mid-presentation.
 */
function offlineSpotAnswer(spot: Spot | undefined): string | null {
  const body = spot?.grounding?.trim();
  if (!spot || !body) return null;
  const source = spot.sources?.[0] ? citationLabel(spot.sources[0]) : "";
  return [
    `${spot.name}について、手元の資料からお伝えします。`,
    "",
    body,
    source ? `（出典: ${source}）` : "",
    "",
    "いまAIとの通信ができないため、資料そのままの案内です。時間をおいてもう一度お試しください。",
  ]
    .filter(Boolean)
    .join("\n");
}

function offlineCompanionAnswer(nearby: NearbySpot[] = []): string | null {
  const spot = nearby.find((s) => s.grounding?.trim());
  if (!spot) return null;
  return [
    `いまAIとつながらないので、手元の資料からお話ししますね。`,
    "",
    `${spot.name}`,
    spot.grounding.trim(),
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
  nearby?: NearbySpot[];
};

export async function POST(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Public endpoint, paid model behind it: cap how fast one caller can spend.
  const limit = rateLimit(clientKey(req), 20, 60_000);
  if (!limit.ok) {
    return new Response(
      `リクエストが多すぎます。${limit.retryAfter}秒ほど待ってからもう一度お試しください。`,
      {
        status: 429,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": String(limit.retryAfter),
        },
      },
    );
  }

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

  const spot = spotId ? getSpot(spotId) : undefined;
  let system: string;

  if (mode === "route") {
    const context = nearby?.length ? nearby.map((s, i) => `${i + 1}. ${s.name}: ${s.grounding}`).join("\n") : "候補スポットなし";
    system = [
      "あなたは日本の文化財をめぐる観光ルート作成AIです。日本語で答えてください。",
      "利用者の条件と候補スポットだけを根拠に、無理のない1つのルートを提案します。",
      "候補にないスポットを作らず、距離や時間は必ず『概算』と書いてください。",
      "条件は飾りではありません。次の目安で必ず内容を変えてください。",
      "・雨: 屋内・軒下・アーケードで過ごせる場所を優先し、立ち寄り数を減らして総距離を短くする。濡れにくい移動の工夫も一言添える。",
      "・『歩きたくない』『ゆったり』などの要望: 立ち寄りを3か所以内、総距離1km程度までに抑える。",
      "・『たくさん歩きたい』: 立ち寄りを増やして構わない。",
      "・『食べ歩き』: 候補にない店名は挙げず、通り沿いや商店街など食事処が集まるエリアを経路に含め、その旨を書く。",
      "条件どうしが噛み合わないとき（例: 雨で食べ歩き）は、無視せずどう折り合いをつけたかを一文で説明してください。",
      "冒頭に『今日の条件』として、天気・気分・要望をどう反映したかを2〜3文でまとめてから、ルートを示してください。",
      "条件が不足して安全・実行可能な提案ができない場合は、勝手に補完せず確認質問を1つだけ返してください。",
      "回答形式: ルート名 / 立ち寄り順 / 概算の合計距離・時間 / 各区間の移動手段 / 途中変更の案内 / 注意事項。",
      "書式は必ずプレーンテキストにしてください。**や*、#、-、`などの記号による装飾は使わず、見出しは「立ち寄り順:」のように全角コロンで書き、箇条書きは「1. 」または「・」だけを使ってください。音声でも読み上げるため、記号が混ざると不自然になります。",
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
      `あなたは${areaFromNearby(nearby)}のまち歩きに寄り添うAIコンパニオンです。`,
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
    if (!spot) {
      return new Response("Unknown spot", { status: 400 });
    }
    system = [
      `あなたは${areaOf(spot)}の文化財「${spot.name}」の案内をするAI音声ガイドです。`,
      "訪れた人の質問に、下記の資料にもとづいて日本語で答えます。",
      "",
      "【このスポットの資料】",
      `名称: ${spot.name}`,
      `指定: ${spot.designation}`,
      `分類: ${spot.category}`,
      `時代: ${spot.era}`,
      `所在地: ${spot.address}`,
      `解説: ${spot.grounding}`,
      `出典: ${spot.sources.map(citationLabel).join(" / ")}`,
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
      "- URLやリンクは読み上げに向かないので、出典は媒体名だけを述べる。",
      "- 挨拶や雑談にも自然に応じてよい。",
    ].join("\n");
  }

  // Without a Gemini API key we cannot reach the model at all. For route mode
  // we still return something usable; other modes report the misconfiguration.
  if (!hasGeminiKey) {
    const offline =
      mode === "route"
        ? fallbackRoute(nearby)
        : mode === "companion"
          ? offlineCompanionAnswer(nearby)
          : offlineSpotAnswer(spot);
    return new Response(
      offline ??
        "いまAIと通信できませんでした。少し時間をおいて、もう一度お試しください。",
      { headers: { "Content-Type": "text/plain; charset=utf-8" } },
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
    // The function itself is capped at 30s; stop a little earlier so a stalled
    // provider still leaves room to send the offline answer below.
    abortSignal: AbortSignal.timeout(18_000),
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
        // One quiet retry: rate limits and 5xx from the provider are usually
        // gone a second later, and a visitor should not have to know that.
        if (isTransient(failure)) {
          await new Promise((r) => setTimeout(r, 800));
          try {
            const retry = await generateText({
              model: MODEL,
              system,
              messages,
              maxOutputTokens: 2048,
              abortSignal: AbortSignal.timeout(6_000),
              providerOptions: {
                google: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
              },
            });
            if (retry.text.trim()) {
              controller.enqueue(encoder.encode(retry.text));
              wrote = true;
            }
          } catch (err) {
            failure = failure ?? (err instanceof Error ? err.message : String(err));
          }
        }
      }
      if (!wrote) {
        // Still nothing. Rather than an apology, fall back to the material the
        // app already carries so the visitor still gets an answer.
        const offline =
          mode === "route"
            ? fallbackRoute(nearby)
            : mode === "companion"
              ? offlineCompanionAnswer(nearby)
              : offlineSpotAnswer(spot);
        const reason = describeFailure(failure);
        controller.enqueue(
          encoder.encode(offline ? `${offline}` : reason),
        );
        // The route fallback text already tells the visitor the plan was built
        // without the AI, so appending the reason only added noise on screen.
        // The provider error is in the server log if it is needed.
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/**
 * Turns a provider error into one short Japanese sentence a visitor can read.
 *
 * The raw provider message is English and often mentions billing consoles and
 * API keys; on a projector during a demo that reads as a broken app. The raw
 * text is already written to the server log by the onError handler above, so
 * nothing is lost by keeping it off the screen.
 */
function describeFailure(raw: string | null): string {
  const text = (raw ?? "").toLowerCase();
  if (!raw) return "AIから応答がありませんでした。少し時間をおいて、もう一度お試しください。";
  if (
    text.includes("prepayment") ||
    text.includes("credits are depleted") ||
    text.includes("billing") ||
    text.includes("insufficient")
  ) {
    return "AIの利用枠が切れています。復旧までは資料からの案内をお届けします。";
  }
  if (text.includes("429") || text.includes("quota") || text.includes("rate limit") || text.includes("resource_exhausted")) {
    return "AIの利用上限に達しました。しばらく待ってからもう一度お試しください。";
  }
  if (text.includes("401") || text.includes("403") || text.includes("api key") || text.includes("permission")) {
    return "AIに接続できませんでした。設定を確認しています。";
  }
  if (text.includes("timeout") || text.includes("aborted")) {
    return "AIの応答に時間がかかりすぎました。もう一度お試しください。";
  }
  return "いまAIと通信できませんでした。少し時間をおいて、もう一度お試しください。";
}

/** Provider hiccups worth one retry: rate limits, overload, 5xx, timeouts. */
function isTransient(raw: string | null): boolean {
  const text = (raw ?? "").toLowerCase();
  if (!raw) return true; // empty response with no error: worth one more try
  return (
    text.includes("429") ||
    text.includes("rate limit") ||
    text.includes("resource_exhausted") ||
    text.includes("overload") ||
    text.includes("unavailable") ||
    text.includes("timeout") ||
    text.includes("503") ||
    text.includes("500") ||
    text.includes("fetch failed") ||
    text.includes("econnreset")
  );
}
