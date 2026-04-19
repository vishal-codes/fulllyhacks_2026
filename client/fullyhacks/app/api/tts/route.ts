import { NextRequest, NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

// A natural, slightly older male voice — good for a patient character.
// Rachel (21m00Tcm4TlvDq8ikWAM) is a calm female voice.
// Adam (pNInz6obpgDQGcFmaJgB) is a natural male voice.
// Change this to any voice ID from your ElevenLabs account.
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — available on all ElevenLabs plans

export async function POST(req: NextRequest) {
  // Use a dedicated TTS key if set, otherwise fall back to the main key.
  // The TTS key must have "text_to_speech" permission enabled in ElevenLabs.
  const apiKey = process.env.ELEVENLABS_TTS_API_KEY ?? process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No ElevenLabs API key configured" }, { status: 500 });
  }

  let text: string;
  try {
    const body = await req.json();
    text = body.text?.trim();
    if (!text) throw new Error("empty");
  } catch {
    return NextResponse.json({ error: "Request body must be { text: string }" }, { status: 400 });
  }

  try {
    const client = new ElevenLabsClient({ apiKey });

    // textToSpeech.convert returns a ReadableStream of audio bytes
    const audioStream = await client.textToSpeech.convert(VOICE_ID, {
      text,
      model_id: "eleven_monolingual_v1", // available on all plans
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    });

    // Collect all chunks into a single Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[tts] ElevenLabs error:", msg);
    return NextResponse.json({ error: "TTS generation failed", detail: msg }, { status: 500 });
  }
}
