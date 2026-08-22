import { experimental_transcribe as transcribe } from "ai"
import { STT_MODEL, hasGatewayKey } from "@/lib/ai"

export const maxDuration = 30

// Server-side speech-to-text via AI Gateway (Whisper).
// On gateway unavailability (rate limit / no access) we return 503 so the
// client falls back to the browser Web Speech API.
export async function POST(req: Request) {
  // No AI Gateway credentials: skip the round-trip and let the client use the
  // browser's Web Speech API (free, no key required).
  if (!hasGatewayKey) {
    return Response.json(
      { error: "stt_unavailable", detail: "server stt disabled; use browser speech recognition" },
      { status: 503 },
    )
  }

  try {
    const form = await req.formData()
    const file = form.get("audio")
    if (!(file instanceof Blob)) {
      return Response.json({ error: "no audio" }, { status: 400 })
    }
    const bytes = new Uint8Array(await file.arrayBuffer())

    const result = await transcribe({
      model: STT_MODEL,
      audio: bytes,
      providerOptions: { openai: { language: "ja" } },
    })

    return Response.json({ text: result.text })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[v0] stt error:", msg)
    // Signal the client to fall back to browser STT.
    return Response.json({ error: "stt_unavailable", detail: msg }, { status: 503 })
  }
}
