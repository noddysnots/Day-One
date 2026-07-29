/**
 * Smoke test for the Gemini key and the two model identifiers this product depends on.
 * Tiny calls only: this exists to pin model strings and prove the image and audio input
 * paths work before the compiler and runtime are built on top of them.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { GoogleGenAI } from '@google/genai';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const PRO_CANDIDATES = ['gemini-2.5-pro'];
const FLASH_CANDIDATES = ['gemini-2.5-flash'];

/** 0.25s 440Hz mono WAV. Proves the audio path is accepted; it is not a stand-in voice note. */
async function tinyWav(): Promise<Buffer> {
  const rate = 8000;
  const samples = rate / 4;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY missing from .env.local');
  console.log(`key prefix: ${apiKey.slice(0, 6)}…  length: ${apiKey.length}\n`);

  const ai = new GoogleGenAI({ apiKey });

  // --- 1. authentication ---
  const seen: string[] = [];
  try {
    const pager = await ai.models.list();
    for await (const m of pager) {
      if (m.name) seen.push(m.name.replace(/^models\//, ''));
      if (seen.length >= 200) break;
    }
    console.log(`AUTH ok — ${seen.length} models visible`);
    const interesting = seen.filter((n) => /2\.5-(pro|flash)|tts/.test(n));
    console.log('relevant models:\n  ' + interesting.join('\n  ') + '\n');
  } catch (e) {
    console.error('AUTH FAILED on models.list');
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const working: Record<string, string> = {};

  // --- 2. text on Flash (the runtime model) ---
  for (const model of FLASH_CANDIDATES) {
    try {
      const r = await ai.models.generateContent({
        model,
        contents: 'Reply with the single word: ready',
        config: { maxOutputTokens: 300 },
      });
      console.log(`TEXT  ${model} -> ${JSON.stringify((r.text ?? '').trim())}`);
      working.flash ??= model;
    } catch (e) {
      console.log(`TEXT  ${model} FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`);
    }
  }

  // --- 3. image on Pro (the compiler model) ---
  const imgPath = 'out/docs/INV-2244.jpg';
  const img = await readFile(imgPath).catch(() => null);
  if (!img) {
    console.log(`\nIMAGE skipped: ${imgPath} not found, run npx tsx scripts/render-docs.ts first`);
  } else {
    for (const model of PRO_CANDIDATES) {
      try {
        const r = await ai.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: img.toString('base64') } },
                { text: 'What is the invoice number and the total due? Answer in under 15 words.' },
              ],
            },
          ],
          config: { maxOutputTokens: 500 },
        });
        console.log(`\nIMAGE ${model} -> ${JSON.stringify((r.text ?? '').trim())}`);
        working.pro ??= model;
      } catch (e) {
        console.log(`\nIMAGE ${model} FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
      }
    }
  }

  // --- 4. audio on Pro ---
  await mkdir('out', { recursive: true });
  const wav = await tinyWav();
  await writeFile('out/tone.wav', wav);
  const audioModel = working.pro ?? PRO_CANDIDATES[0];
  try {
    const r = await ai.models.generateContent({
      model: audioModel,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
            { text: 'Describe this audio in under 10 words.' },
          ],
        },
      ],
      config: { maxOutputTokens: 500 },
    });
    console.log(`AUDIO ${audioModel} accepted audio/wav -> ${JSON.stringify((r.text ?? '').trim())}`);
    working.audio = audioModel;
  } catch (e) {
    console.log(`AUDIO ${audioModel} FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
  }

  console.log('\n--- pinned ---');
  console.log(`compiler (Pro):  ${working.pro ?? 'NONE WORKED'}`);
  console.log(`runtime (Flash): ${working.flash ?? 'NONE WORKED'}`);
  console.log(`audio input:     ${working.audio ? 'accepted on ' + working.audio : 'NOT confirmed'}`);
}

void main().catch((e) => {
  console.error('smoke test failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
