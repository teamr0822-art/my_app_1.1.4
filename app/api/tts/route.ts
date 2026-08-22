import { experimental_generateSpeech as generateSpeech } from "ai"
import { TTS_MODEL, hasGatewayKey } from "@/lib/ai"

export const maxDuration = 30

type Body = {
  text: string
  voice?: string
  speed?: number
}

// Server-side text-to-speech via AI Gateway (OpenAI tts-1).
// On gateway unavailability (rate limit / no access) we return 503 so the
// client falls back to the browser SpeechSynthesis API.
export async function POST(req: Request) {
  // No AI Gateway credentials: skip the round-trip and let the client use the
  // browser's Web Speech API (free, no key required).
  if (!hasGatewayKey) {
    return Response.json(
      { error: "tts_unavailable", detail: "server tts disabled; use browser speech synthesis" },
      { status: 503 },
    )
  }

  try {
    const { text, voice = "nova", speed = 1 }: Body = await req.json()
    if (!text || !text.trim()) {
      return Response.json({ error: "no text" }, { status: 400 })
    }

    const result = await generateSpeech({
      model: TTS_MODEL,
      text: text.slice(0, 1200),
      voice,
      providerOptions: {
        openai: { speed: Math.max(0.5, Math.min(2, speed)) },
      },
    })

    const bytes = result.audio.uint8Array
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "Content-Type": result.audio.mediaType || "audio/mpeg",
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[v0] tts error:", msg)
    return Response.json({ error: "tts_unavailable", detail: msg }, { status: 503 })
  }
}
