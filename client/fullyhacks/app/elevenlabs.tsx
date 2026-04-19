import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import dotenv from 'dotenv'

dotenv.config();

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});


export async function createToken()

{
      const token = await elevenlabs.tokens.singleUse.create("realtime_scribe");
      return token;
}