import { config } from 'dotenv';
config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';

const CANDIDATES = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-flash-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-3.1-pro-preview',
  'gemini-3-pro-preview',
  'gemini-pro-latest',
  'gemini-2.5-pro',
];

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  for (const model of CANDIDATES) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: 'Say: ready',
        config: { maxOutputTokens: 900 },
      });
      const text = (r.text ?? '').trim();
      const fin = r.candidates?.[0]?.finishReason ?? '?';
      const u = r.usageMetadata;
      console.log(
        `ok    ${model.padEnd(26)} finish=${String(fin).padEnd(10)} text=${JSON.stringify(text.slice(0, 40))} tokens=${u?.promptTokenCount}/${u?.candidatesTokenCount}${u?.thoughtsTokenCount ? '+' + u.thoughtsTokenCount + 'thought' : ''}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let brief = msg;
      try {
        const j = JSON.parse(msg);
        brief = `${j.error?.code} ${j.error?.status}: ${String(j.error?.message).split('\n')[0].slice(0, 150)}`;
      } catch {
        brief = msg.slice(0, 160);
      }
      console.log(`FAIL  ${model.padEnd(26)} ${brief}`);
    }
  }
}
void main();
