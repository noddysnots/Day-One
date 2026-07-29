import { config } from 'dotenv';
config({ path: '.env.local' });
import { GoogleGenAI, Type } from '@google/genai';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const MODEL = 'gemini-3.6-flash';

function tinyWav(): Buffer {
  const rate = 8000;
  const n = rate / 4;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  // full quota error for the record
  try {
    await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: 'hi', config: { maxOutputTokens: 600 } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      const j = JSON.parse(msg);
      console.log('PRO QUOTA ERROR:\n' + String(j.error?.message).slice(0, 700) + '\n');
    } catch { console.log('PRO QUOTA ERROR (raw):\n' + msg.slice(0, 700) + '\n'); }
  }

  // image
  const img = await readFile('out/docs/INV-2244.jpg');
  const ri = await ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: 'image/jpeg', data: img.toString('base64') } },
      { text: 'Invoice number and total due? Under 15 words.' },
    ] }],
    config: { maxOutputTokens: 900 },
  });
  console.log(`IMAGE ${MODEL} -> ${JSON.stringify((ri.text ?? '').trim())}`);

  // audio
  await mkdir('out', { recursive: true });
  const wav = tinyWav();
  await writeFile('out/tone.wav', wav);
  try {
    const ra = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [
        { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
        { text: 'Describe this audio in under 10 words.' },
      ] }],
      config: { maxOutputTokens: 900 },
    });
    console.log(`AUDIO ${MODEL} accepted audio/wav -> ${JSON.stringify((ra.text ?? '').trim())}`);
  } catch (e) {
    console.log(`AUDIO ${MODEL} FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
  }

  // function calling, the runtime depends on it
  try {
    const rf = await ai.models.generateContent({
      model: MODEL,
      contents: 'Look up purchase order PO-3301 using the tool.',
      config: {
        maxOutputTokens: 900,
        tools: [{ functionDeclarations: [{
          name: 'lookup_po',
          description: 'Look up a purchase order by number.',
          parameters: { type: Type.OBJECT, properties: { po_number: { type: Type.STRING } }, required: ['po_number'] },
        }] }],
      },
    });
    const calls = rf.functionCalls ?? [];
    console.log(`TOOLS ${MODEL} -> ${calls.length} call(s): ${JSON.stringify(calls.map((c) => ({ n: c.name, a: c.args })))}`);
  } catch (e) {
    console.log(`TOOLS ${MODEL} FAILED: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
  }
}
void main();
