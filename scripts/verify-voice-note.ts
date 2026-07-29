import { config } from 'dotenv';
config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';
import { readFile } from 'node:fs/promises';
import { COMPILER_MODEL } from '../lib/models';

/**
 * Is the asset actually usable, or merely present? Two independent checks.
 *
 * The container is validated by hand off the bytes — RIFF/WAVE magic, the fmt chunk, and a peak
 * and RMS so a file of well-formed silence cannot pass. Then the file goes back to the compiler's
 * own model as an inline audio part, because the only fidelity test that counts is whether the
 * model that will read this can hear the operating figures. Anything the compiler mishears becomes
 * a wrong rule, and a wrong rule is not recoverable.
 */

const FILE = 'public/intake/voice-note.wav';

/** The figures the rulebook is built out of. Each needs at least one surviving form. */
const FIGURES: { label: string; any: RegExp[] }[] = [
  { label: '$500 fast path', any: [/five hundred/i, /\$?\s?500\b/] },
  { label: '2% tolerance', any: [/two percent/i, /2\s?%/] },
  { label: '$50 tolerance floor', any: [/fifty (bucks|dollars)/i, /\$?\s?50\b/] },
  { label: '"whichever is smaller"', any: [/whichever is (smaller|lower|less)/i] },
  { label: 'Priya owns the exception queue', any: [/priya/i] },
  { label: 'exception queue named', any: [/exception queue/i] },
  { label: 'Northline named', any: [/north\s?line/i] },
  { label: 'Northline double-billing history', any: [/double[\s-]?bill/i] },
  { label: 'freight hedge ("ask me")', any: [/if it'?s freight and it'?s over,? ask me/i] },
  { label: 'freight contract caveat', any: [/pull the contract/i] },
  { label: '$10,000 ceiling', any: [/ten thousand/i, /10[,.]?000/] },
  { label: 'missing PO routes to Priya', any: [/missing po/i] },
];

function inspectWav(buf: Buffer) {
  const riff = buf.toString('ascii', 0, 4);
  const wave = buf.toString('ascii', 8, 12);
  const fmt = buf.toString('ascii', 12, 16);
  const audioFormat = buf.readUInt16LE(20);
  const channels = buf.readUInt16LE(22);
  const rate = buf.readUInt32LE(24);
  const bits = buf.readUInt16LE(34);
  const dataTag = buf.toString('ascii', 36, 40);
  const dataLen = buf.readUInt32LE(40);

  const pcm = buf.subarray(44, 44 + dataLen);
  const n = Math.floor(pcm.length / 2);
  let peak = 0;
  let sum = 0;
  let loud = 0;
  for (let i = 0; i < n; i++) {
    const s = Math.abs(pcm.readInt16LE(i * 2));
    peak = Math.max(peak, s);
    sum += s * s;
    if (s > 328) loud++; // >1% of full scale, i.e. not room tone
  }
  // Runs of room tone at least 400 ms long: the stage directions should show up here as gaps,
  // which is the only way to tell a rendered pause from the word "pause" being read aloud.
  const win = Math.floor(rate / 50); // 20 ms
  const quiet: boolean[] = [];
  for (let w = 0; w + win <= n; w += win) {
    let m = 0;
    for (let i = 0; i < win; i++) m = Math.max(m, Math.abs(pcm.readInt16LE((w + i) * 2)));
    quiet.push(m < 656); // 2% of full scale
  }
  const gaps: { at: number; len: number }[] = [];
  let run = 0;
  for (let i = 0; i <= quiet.length; i++) {
    if (quiet[i]) run++;
    else {
      if (run >= 20) gaps.push({ at: ((i - run) * win) / rate, len: (run * win) / rate });
      run = 0;
    }
  }

  return {
    riff,
    wave,
    fmt,
    audioFormat,
    channels,
    rate,
    bits,
    dataTag,
    dataLen,
    gaps,
    declaredSize: buf.readUInt32LE(4),
    actualSize: buf.length - 8,
    seconds: dataLen / (channels * (bits / 8)) / rate,
    peak: peak / 32768,
    rms: Math.sqrt(sum / n) / 32768,
    voicedPct: (loud / n) * 100,
  };
}

async function main() {
  const buf = await readFile(FILE);
  const w = inspectWav(buf);

  const ok = (b: boolean) => (b ? 'PASS' : 'FAIL');
  console.log('--- container ---');
  console.log(`${ok(w.riff === 'RIFF' && w.wave === 'WAVE' && w.fmt === 'fmt ')}  RIFF/WAVE/fmt magic: ${w.riff}/${w.wave}/${w.fmt.trim()}`);
  console.log(`${ok(w.audioFormat === 1)}  format ${w.audioFormat} (1 = uncompressed PCM), ${w.bits}-bit`);
  console.log(`${ok(w.channels === 1 && w.rate === 24000)}  ${w.rate} Hz, ${w.channels} channel`);
  console.log(`${ok(w.dataTag === 'data' && w.dataLen === buf.length - 44)}  data chunk ${w.dataLen} bytes, file tail ${buf.length - 44}`);
  console.log(`${ok(w.declaredSize === w.actualSize)}  RIFF size field ${w.declaredSize} vs actual ${w.actualSize}`);
  console.log(`${ok(w.seconds >= 30)}  duration ${w.seconds.toFixed(1)} s`);
  console.log(`${ok(w.peak > 0.1 && w.rms > 0.005)}  not silent: peak ${w.peak.toFixed(3)}, rms ${w.rms.toFixed(4)}, ${w.voicedPct.toFixed(1)}% of samples above room tone`);
  console.log(`${ok(w.gaps.length >= 3)}  ${w.gaps.length} pause(s) of 400 ms or more: ${w.gaps.map((g) => `${g.len.toFixed(1)}s @ ${g.at.toFixed(0)}s`).join(', ')}`);

  if (process.argv.includes('--container-only')) return;

  console.log(`\n--- transcribing back through ${COMPILER_MODEL} ---`);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const res = await ai.models.generateContent({
    model: COMPILER_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'audio/wav', data: buf.toString('base64') } },
          {
            text:
              'Transcribe this voice note verbatim. Include every filler word, hesitation and false ' +
              'start exactly as spoken. Do not summarise, do not tidy the grammar, do not add ' +
              'speaker labels or commentary. Output the transcript text only.',
          },
        ],
      },
    ],
    config: { temperature: 0, maxOutputTokens: 4000 },
  });

  const transcript = (res.text ?? '').trim();
  console.log(transcript || '(empty)');

  console.log('\n--- operating figures heard back ---');
  let lost = 0;
  for (const f of FIGURES) {
    const hit = f.any.some((r) => r.test(transcript));
    if (!hit) lost++;
    console.log(`${hit ? 'HEARD ' : 'LOST  '} ${f.label}`);
  }
  console.log(`\n${lost === 0 ? 'all figures survived' : `${lost} figure(s) lost`}`);

  const script = await readFile('public/intake/voice-note-script.md', 'utf8');
  const norm = (s: string) =>
    s.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9$%]+/g, ' ').trim().split(' ');
  const scriptWords = norm(script);
  const heard = new Set(norm(transcript));
  const missing = scriptWords.filter((word) => !heard.has(word));
  console.log(`script words ${scriptWords.length}, transcript words ${norm(transcript).length}`);
  console.log(`script words never heard: ${missing.length ? [...new Set(missing)].join(', ') : 'none'}`);
}
void main();
