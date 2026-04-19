import { NextResponse } from "next/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY is not set" },
      { status: 500 }
    );
  }

  try {
    const client = new ElevenLabsClient({ apiKey });
    const result = await client.tokens.singleUse.create("realtime_scribe");
    // result is { token: string } — return the inner string
    return NextResponse.json({ token: result.token });
  } catch (err) {
    console.error("[scribe-token] Failed to create token:", err);
    return NextResponse.json(
      { error: "Failed to create ElevenLabs token" },
      { status: 500 }
    );
  }
}
