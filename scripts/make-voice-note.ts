import { config } from 'dotenv';
config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Synthesise the controller's voice note from public/intake/voice-note-script.md.
 *
 * Two things matter beyond "it made a sound". The spoken words have to stay a verbatim match for
 * the script on disk, because the contract screen highlights provenance quotes against the
 * transcript — so the parenthetical stage directions are stripped rather than reworded, and the
 * disfluencies are left exactly where Dana put them. And the API hands back raw little-endian
 * PCM, not a file: the mime type is the only place the sample rate and channel count are stated,
 * so it gets parsed rather than assumed, and a RIFF header is built around the samples.
 */

const TTS_MODEL = process.env.TTS_MODEL ?? 'gemini-3.1-flash-tts-preview';
const VOICE = process.env.TTS_VOICE ?? 'Aoede';
const OUT = 'public/intake/voice-note.wav';

const STYLE = `Read this as a real voicemail: the outgoing finance controller, Dana, recording a
quick handover note on her phone between meetings. Slightly rushed and conversational, a little
tired, thinking out loud rather than presenting. Keep every "um", "uh", "so" and false start
exactly as written — do not clean up the grammar and do not skip or reorder any words.
Where a line contains only dots, fall silent for a beat instead of speaking; never say the word
"pause" or "break" or read any stage direction aloud. Speak only the words of the note itself.

The note:

`;

/** Stage directions become silence markers; everything else is spoken verbatim. */
function spokenFrom(script: string): string {
  return script
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (/^\(.*\)$/s.test(p) ? '. . . . .' : p))
    .join('\n\n');
}

type Pcm = { data: Buffer; rate: number; channels: number };

/** e.g. "audio/L16;codec=pcm;rate=24000" or "audio/l16; rate=24000; channels=1" */
function parsePcm(data: Buffer, mimeType: string | undefined): Pcm {
  const rate = Number(/rate=(\d+)/i.exec(mimeType ?? '')?.[1] ?? 24000);
  const channels = Number(/channels=(\d+)/i.exec(mimeType ?? '')?.[1] ?? 1);
  return { data, rate, channels };
}

function toWav({ data, rate, channels }: Pcm): Buffer {
  const bits = 16;
  const blockAlign = (channels * bits) / 8;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

function level(data: Buffer) {
  const n = Math.floor(data.length / 2);
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const s = data.readInt16LE(i * 2);
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  return { peak: peak / 32768, rms: Math.sqrt(sum / n) / 32768 };
}

async function main() {
  const script = await readFile('public/intake/voice-note-script.md', 'utf8');
  const text = spokenFrom(script);
  const words = text.replace(/\. \. \. \. \./g, ' ').split(/\s+/).filter(Boolean).length;
  console.log(`model  ${TTS_MODEL}\nvoice  ${VOICE}\nwords  ${words}\n`);

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const res = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text: STYLE + text }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
    },
  });

  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData?.data) {
    throw new Error(`no audio returned. finishReason=${res.candidates?.[0]?.finishReason}`);
  }

  const pcm = parsePcm(Buffer.from(part.inlineData.data, 'base64'), part.inlineData.mimeType);
  const wav = toWav(pcm);
  await writeFile(OUT, wav);

  const seconds = pcm.data.length / 2 / pcm.channels / pcm.rate;
  const { peak, rms } = level(pcm.data);
  console.log(
    [
      `mime      ${part.inlineData.mimeType}`,
      `finish    ${res.candidates?.[0]?.finishReason ?? 'n/a'}`,
      `rate      ${pcm.rate} Hz, ${pcm.channels} ch, 16-bit`,
      `duration  ${seconds.toFixed(1)} s`,
      `pace      ${Math.round(words / (seconds / 60))} wpm`,
      `peak      ${peak.toFixed(3)}   rms ${rms.toFixed(4)}`,
      `wrote     ${OUT} (${wav.length} bytes)`,
    ].join('\n'),
  );
}
void main();
