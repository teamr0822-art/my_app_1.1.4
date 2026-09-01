import "server-only"
import { createGoogleGenerativeAI } from "@ai-sdk/google"

/**
 * Text generation runs on the Google Gemini API (Google AI Studio).
 *
 * The free tier requires no credit card: create an API key at
 * https://aistudio.google.com/apikey and set it as GEMINI_API_KEY
 * (GOOGLE_GENERATIVE_AI_API_KEY is also accepted).
 */
export const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim() ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
  ""

export const hasGeminiKey = GEMINI_API_KEY.length > 8

const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })

/**
 * Which Gemini model to talk to.
 *
 * This was pinned to gemini-2.5-flash. That model has since been closed to new
 * API keys: an existing key kept working, but issuing a *fresh* key and putting
 * it in produced
 *
 *   "This model models/gemini-2.5-flash is no longer available to new users.
 *    Please update your code to use models/gemini-3.6-flash"
 *
 * — which looked exactly like a broken key, because nothing on screen said the
 * model was the problem. It is an env var now so the next time Google retires a
 * model it is a Vercel setting, not a code change and a redeploy.
 */
export const CHAT_MODEL_ID = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash"

export const CHAT_MODEL = google(CHAT_MODEL_ID)

/**
 * Server-side audio (STT/TTS) still runs through the Vercel AI Gateway, which
 * needs a card on file. When AI_GATEWAY_API_KEY is absent the audio routes
 * return 503 immediately and the client falls back to the browser's built-in
 * Web Speech API, which is free and needs no key.
 */
export const hasGatewayKey = (process.env.AI_GATEWAY_API_KEY?.trim().length ?? 0) > 8
export const STT_MODEL = "openai/whisper-1"
export const TTS_MODEL = "openai/tts-1"
