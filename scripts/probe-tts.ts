import { config } from 'dotenv';
config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';

/**
 * Which TTS model, if any, will this key actually speak with? The classic
 * gemini-2.5-*-preview-tts strings are 2.5-family and 2.5 is 404 on this key, so listing is not
 * enough — every candidate gets a real one-word synthesis call and we keep whatever returns audio.
 */

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  const listed: { name: string; methods: string[] }[] = [];
  for await (const m of await ai.models.list()) {
    if (!m.name) continue;
    listed.push({ name: m.name.replace(/^models\//, ''), methods: m.supportedActions ?? [] });
  }

  console.log(`${listed.length} models on this key\n--- anything audio/tts-shaped ---`);
  const shaped = listed.filter((m) => /tts|speech|audio|dialog/i.test(m.name));
  for (const m of shaped) console.log(`${m.name.padEnd(46)} ${m.methods.join(',')}`);

  const candidates = [
    ...shaped.filter((m) => /tts/i.test(m.name)).map((m) => m.name),
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
  ].filter((n, i, a) => a.indexOf(n) === i);

  console.log(`\n--- live synthesis probe (${candidates.length} candidates) ---`);
  for (const model of candidates) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'Say: testing.' }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const part = r.candidates?.[0]?.content?.parts?.[0];
      const bytes = part?.inlineData?.data ? Buffer.from(part.inlineData.data, 'base64').length : 0;
      console.log(`OK    ${model.padEnd(40)} ${bytes} bytes  mime=${part?.inlineData?.mimeType}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      let short = msg;
      try {
        short = String(JSON.parse(msg).error?.message ?? msg);
      } catch {}
      console.log(`FAIL  ${model.padEnd(40)} ${short.slice(0, 160)}`);
    }
  }
}
void main();
