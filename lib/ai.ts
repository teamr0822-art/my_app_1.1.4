import "server-only"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createGroq } from "@ai-sdk/groq"

/**
 * The guide can talk to two providers, and will use whichever is working.
 *
 * Google Gemini (https://aistudio.google.com/apikey) → GEMINI_API_KEY
 * Groq          (https://console.groq.com/keys)      → GROQ_API_KEY
 *
 * Either one alone is enough. Setting both is the point of this file: a free
 * Gemini key runs out of its daily allowance, and a brand-new Gemini model can
 * answer "This model is currently experiencing high demand" for an afternoon.
 * Neither is a bug to fix, and neither should stop a visitor standing in front
 * of a shrine from hearing about it — so when one provider will not answer the
 * guide quietly asks the next candidate instead.
 */
export const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
  ""

export const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim() || ""

export const hasGeminiKey = GEMINI_API_KEY.length > 8
export const hasGroqKey = GROQ_API_KEY.length > 8
export const hasAnyKey = hasGeminiKey || hasGroqKey

const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })
const groq = createGroq({ apiKey: GROQ_API_KEY })

export type Provider = "google" | "groq"
export type Candidate = { provider: Provider; id: string }

/**
 * Gemini names change under you: gemini-2.5-flash was closed to new API keys
 * without warning, and the replacement its own error message named had already
 * been superseded. GEMINI_MODEL / GROQ_MODEL exist so the next time that
 * happens it is a Vercel setting rather than a code change.
 */
const GEMINI_IDS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  // Older family, kept last: it needs a different "thinking" setting (see
  // callOptionsFor in the chat route) and is the least likely to be busy.
  "gemini-2.5-flash",
]

/**
 * Groq models, best first.
 *
 * gpt-oss-120b leads because it is the one this account was measured answering
 * (311ms — an order of magnitude quicker than Gemini was managing). It is a
 * reasoning model, so it needs the settings in callOptionsFor: left alone it
 * spends the whole allowance thinking and returns empty text, the same trap
 * gemini-2.5-flash had.
 *
 * llama-3.3-70b-versatile is deliberately NOT here: this account answered
 * "The model `llama-3.3-70b-versatile` does not exist or you do not have
 * access to it."
 */
const GROQ_IDS = [
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct-0905",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
]

/**
 * Which provider gets asked first. Groq leads when a key is present: its free
 * allowance is far larger than Gemini's and it answers noticeably faster, which
 * matters when someone is waiting on a street corner. AI_PRIMARY=gemini flips
 * it back.
 */
const primary: Provider =
  process.env.AI_PRIMARY?.trim().toLowerCase() === "gemini"
    ? "google"
    : hasGroqKey
      ? "groq"
      : "google"

const geminiCandidates: Candidate[] = hasGeminiKey
  ? Array.from(
      new Set([process.env.GEMINI_MODEL?.trim(), ...GEMINI_IDS].filter(Boolean) as string[]),
    ).map((id) => ({ provider: "google" as const, id }))
  : []

const groqCandidates: Candidate[] = hasGroqKey
  ? Array.from(
      new Set([process.env.GROQ_MODEL?.trim(), ...GROQ_IDS].filter(Boolean) as string[]),
    ).map((id) => ({ provider: "groq" as const, id }))
  : []

/** Every model worth trying, best first. Empty when no key is configured. */
export const CHAT_CANDIDATES: Candidate[] =
  primary === "groq"
    ? [...groqCandidates, ...geminiCandidates]
    : [...geminiCandidates, ...groqCandidates]

export const chatModel = (c: Candidate) =>
  c.provider === "groq" ? groq(c.id) : google(c.id)

/** Label used in logs and in the diagnostic switch. */
export const labelOf = (c: Candidate) => `${c.provider}:${c.id}`

export const CHAT_PRIMARY: Candidate | undefined = CHAT_CANDIDATES[0]

/**
 * Server-side audio (STT/TTS) still runs through the Vercel AI Gateway, which
 * needs a card on file. When AI_GATEWAY_API_KEY is absent the audio routes
 * return 503 immediately and the client falls back to the browser's built-in
 * Web Speech API, which is free and needs no key.
 */
export const hasGatewayKey = (process.env.AI_GATEWAY_API_KEY?.trim().length ?? 0) > 8
export const STT_MODEL = "openai/whisper-1"
export const TTS_MODEL = "openai/tts-1"
