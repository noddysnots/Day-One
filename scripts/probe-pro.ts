/**
 * Read-only: does this key answer on the Pro strings? The entitlement changed when billing was
 * enabled, so the note in lib/models.ts has to be checked against the API rather than remembered.
 *
 * Usage: npx tsx scripts/probe-pro.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { GoogleGenAI } from '@google/genai';

const CANDIDATES = [
  'gemini-3.1-pro-preview',
  'gemini-pro-latest',
  'gemini-2.5-pro',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  for (const model of CANDIDATES) {
    const started = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents: 'Reply with the single word: yes',
        config: { maxOutputTokens: 2000, temperature: 0 },
      });
      const said = (response.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
      console.log(`${model.padEnd(26)} OK    ${Date.now() - started}ms  said "${said}"`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code = message.match(/"code":\s*(\d+)/)?.[1] ?? '?';
      const status = message.match(/"status":\s*"([A-Z_]+)"/)?.[1] ?? '';
      const limit = /limit: 0/.test(message) ? '  limit: 0' : '';
      console.log(`${model.padEnd(26)} ${code} ${status}${limit}`);
      console.log(`  ${message.replace(/\s+/g, ' ').slice(0, 220)}`);
    }
  }
}

void main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
