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
 * model was the problem. Switching to the model named in that message did not
 * fix it either, so the default is now the current generally-available Flash
 * model. It is an env var so the next time Google retires one it is a Vercel
 * setting, not a code change: set GEMINI_MODEL to the new name.
 */
const DEFAULT_MODEL_IDS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-flash-latest"]

/**
 * Models to try, in order. GEMINI_MODEL (if set) goes first, then the defaults.
 *
 * The list exists because a brand-new model can be busy: the newest Flash
 * answered "This model is currently experiencing high demand", which is not a
 * configuration problem and not something a visitor standing in front of a
 * shrine should have to wait out. When the first model is overloaded the guide
 * quietly asks the next one instead.
 */
export const CHAT_MODEL_IDS: string[] = Array.from(
  new Set([process.env.GEMINI_MODEL?.trim(), ...DEFAULT_MODEL_IDS].filter(Boolean) as string[]),
)

export const CHAT_MODEL_ID = CHAT_MODEL_IDS[0]

export const chatModel = (id: string) => google(id)

export const CHAT_MODEL = chatModel(CHAT_MODEL_ID)

/**
 * Server-side audio (STT/TTS) still runs through the Vercel AI Gateway, which
 * needs a card on file. When AI_GATEWAY_API_KEY is absent the audio routes
 * return 503 immediately and the client falls back to the browser's built-in
 * Web Speech API, which is free and needs no key.
 */
export const hasGatewayKey = (process.env.AI_GATEWAY_API_KEY?.trim().length ?? 0) > 8
export const STT_MODEL = "openai/whisper-1"
export const TTS_MODEL = "openai/tts-1"
