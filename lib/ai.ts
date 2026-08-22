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

// Free-tier model on the Gemini API.
export const CHAT_MODEL = google("gemini-2.5-flash")

/**
 * Server-side audio (STT/TTS) still runs through the Vercel AI Gateway, which
 * needs a card on file. When AI_GATEWAY_API_KEY is absent the audio routes
 * return 503 immediately and the client falls back to the browser's built-in
 * Web Speech API, which is free and needs no key.
 */
export const hasGatewayKey = (process.env.AI_GATEWAY_API_KEY?.trim().length ?? 0) > 8
export const STT_MODEL = "openai/whisper-1"
export const TTS_MODEL = "openai/tts-1"
