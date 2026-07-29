import { config } from 'dotenv';
config({ path: '.env.local' });
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { compileInputs, voiceNote } from '../lib/intake';

/**
 * Does the handover pack read the way the screen and the compiler expect? Read-only: compileInputs
 * only touches disk, so this proves the audio branch is taken without compiling anything.
 */

async function main() {
  const dir = path.join(process.cwd(), 'public', 'intake');
  console.log('--- public/intake ---');
  for (const f of (await readdir(dir)).sort()) {
    const s = await stat(path.join(dir, f));
    console.log(`  ${f.padEnd(26)} ${s.size.toLocaleString()} bytes`);
  }

  console.log('\n--- lib/intake.ts ---');
  console.log(`voiceNote()  ${JSON.stringify(voiceNote())}`);

  const { inputs, note } = await compileInputs();
  console.log(`note         ${note}`);
  console.log(`audio part   ${inputs.voiceNote ? `${inputs.voiceNote.data.length.toLocaleString()} bytes as ${inputs.voiceNote.mimeType}` : 'none'}`);
  console.log(`email        ${inputs.emailThread?.length ?? 0} chars`);
  console.log(`script appended to email: ${inputs.emailThread?.includes('voice note (transcript)') ? 'YES (audio branch not taken)' : 'no'}`);
  console.log(`samples      ${inputs.invoiceSamples.map((s) => s.name).join(', ')}`);

  // Inline parts are base64'd into the request body, so the next compile has to fit a 20 MB cap.
  const raw = (inputs.voiceNote?.data.length ?? 0) + inputs.invoiceSamples.reduce((n, s) => n + s.data.length, 0);
  const encoded = Math.ceil(raw / 3) * 4;
  console.log('\n--- next compile request ---');
  console.log(`inline raw   ${raw.toLocaleString()} bytes`);
  console.log(`base64       ${encoded.toLocaleString()} bytes (${(encoded / 1e6).toFixed(1)} MB of a 20 MB inline cap)`);
}
void main();
