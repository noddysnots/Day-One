import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { invoices, invoiceTotals, vendors } from '@/data/corpus';

/**
 * The handover pack, read off disk rather than out of the database: this is what landed in the
 * inbox before anything was ingested, so the screen has to stand up on a machine with no
 * credentials. The figures come from data/corpus.ts, which is the same source the seed and the
 * rendered documents use, so the paper and the ledger cannot disagree.
 */

const PUBLIC = path.join(process.cwd(), 'public');

const AUDIO_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
};

export type IntakeDoc = { invoiceNumber: string; vendor: string; total: number; src: string };

export function voiceNote(): { src: string; type: string } | null {
  for (const [ext, type] of Object.entries(AUDIO_TYPES)) {
    if (existsSync(path.join(PUBLIC, 'intake', `voice-note${ext}`))) {
      return { src: `/intake/voice-note${ext}`, type };
    }
  }
  return null;
}

export async function emailThread(): Promise<string | null> {
  try {
    return await readFile(path.join(PUBLIC, 'intake', 'email-thread.md'), 'utf8');
  } catch {
    return null;
  }
}

const SAMPLE_CASES = [1, 2, 3, 4, 5];
const SCRIPTS = ['voice-note-script.md', 'voice-note.md', 'voice-note-script.txt'];

/**
 * The handover exactly as the compiler will see it. Audio goes in natively when it exists; a
 * written script is the documented fallback and gets appended to the thread instead, which is
 * why the returned note says which of the two happened.
 */
export async function compileInputs() {
  const email = await emailThread();
  const samples = await Promise.all(
    invoices
      .filter((i) => i.case_no !== null && SAMPLE_CASES.includes(i.case_no))
      .map(async (inv) => ({
        name: inv.invoice_number,
        data: await readFile(path.join(PUBLIC, 'docs', `${inv.invoice_number}.jpg`)),
        mimeType: 'image/jpeg',
      })),
  );

  const audio = voiceNote();
  if (audio) {
    return {
      inputs: {
        emailThread: email,
        voiceNote: { data: await readFile(path.join(PUBLIC, audio.src)), mimeType: audio.type },
        invoiceSamples: samples,
      },
      note: `voice note read as ${audio.type}`,
    };
  }

  const script = SCRIPTS.map((f) => path.join(PUBLIC, 'intake', f)).find((p) => existsSync(p));
  if (script) {
    const text = await readFile(script, 'utf8');
    return {
      inputs: {
        emailThread: `${email ?? ''}\n\n--- Controller voice note (transcript) ---\n${text}`,
        voiceNote: null,
        invoiceSamples: samples,
      },
      note: 'no audio on file, reading the written script instead',
    };
  }

  return {
    inputs: { emailThread: email, voiceNote: null, invoiceSamples: samples },
    note: 'no voice note at all, compiling from the thread and the documents',
  };
}

export function intakeDocs(): IntakeDoc[] {
  const name = new Map(vendors.map((v) => [v.key, v.name]));
  return invoices
    .map((inv) => ({
      invoiceNumber: inv.invoice_number,
      vendor: name.get(inv.vendor) ?? inv.vendor,
      total: invoiceTotals(inv).total,
      src: `/docs/${inv.invoice_number}.jpg`,
    }))
    .filter((d) => existsSync(path.join(PUBLIC, d.src)));
}
