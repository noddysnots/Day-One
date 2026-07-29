import { config } from 'dotenv';
config({ path: '.env.local' });
import { GoogleGenAI } from '@google/genai';

async function main() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const pager = await ai.models.list();
  const all: { name: string; methods: string[] }[] = [];
  for await (const m of pager) {
    if (!m.name) continue;
    all.push({ name: m.name.replace(/^models\//, ''), methods: m.supportedActions ?? [] });
  }
  console.log(`${all.length} models\n`);
  for (const m of all) {
    if (/embedding|aqa|imagen|veo|tts|image|native-audio|robotics|learnlm/.test(m.name)) continue;
    console.log(`${m.name.padEnd(46)} ${m.methods.join(',')}`);
  }
}
void main();
