import "server-only"

/**
 * Credential normalization for the Vercel AI Gateway.
 *
 * In some environments an OIDC-style token (prefix "AQ.") is injected into
 * AI_GATEWAY_API_KEY. The gateway rejects that value when it is sent as an API
 * key (HTTP 401). Real gateway API keys start with "vck_". When the configured
 * key is not a real API key, we remove it so the AI SDK falls back to the
 * automatic Vercel OIDC exchange (which authenticates correctly).
 */
// Keep the project-provided credential intact. Vercel deployments may inject
// either a vck_ API key or an OIDC-backed gateway credential; both are valid
// authentication paths and must not be removed at module load time.

// Free-tier-accessible models (verified against the gateway).
export const CHAT_MODEL = "google/gemini-2.5-flash"
// Server audio models. These may be rate-limited on the free tier; callers
// must handle failures and fall back to the browser Web Speech API.
export const STT_MODEL = "openai/whisper-1"
export const TTS_MODEL = "openai/tts-1"
