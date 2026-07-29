/**
 * The half of build step 1 that does not depend on DDL: bucket, uploads, and public URLs
 * that actually return an image. Run again after the tables exist and the seed will reuse
 * these same objects.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { invoices } from '../data/corpus';

async function main() {
  const { db, DOC_BUCKET } = await import('../lib/supabase');

  const { error: mk } = await db.storage.createBucket(DOC_BUCKET, { public: true });
  if (mk && !/exists/i.test(mk.message)) throw new Error(`createBucket: ${mk.message}`);
  console.log(`bucket "${DOC_BUCKET}" ${mk ? 'already existed' : 'created'} (public)`);

  const urls: Record<string, string> = {};
  for (const inv of invoices) {
    const file = path.join('public', 'docs', `${inv.invoice_number}.jpg`);
    const buf = await readFile(file);
    const key = `${inv.invoice_number}.jpg`;
    const { error } = await db.storage.from(DOC_BUCKET).upload(key, buf, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(`upload ${key}: ${error.message}`);
    urls[inv.invoice_number] = db.storage.from(DOC_BUCKET).getPublicUrl(key).data.publicUrl;
  }
  console.log(`uploaded ${Object.keys(urls).length} documents`);

  const { data: listed, error: listErr } = await db.storage.from(DOC_BUCKET).list('', { limit: 100 });
  if (listErr) throw new Error(`list: ${listErr.message}`);
  console.log(`bucket now holds ${listed!.length} objects`);

  // Fetch two for real and confirm they are images, not an error page or a signed-URL redirect.
  for (const name of ['INV-2244', 'INV-8841']) {
    const url = urls[name];
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    console.log(
      `GET ${name}.jpg -> ${res.status} ${res.headers.get('content-type')} ${buf.length} bytes, jpeg magic ${isJpeg ? 'ok' : 'MISSING'}`,
    );
    if (res.status !== 200 || !isJpeg) throw new Error(`${name} did not come back as a working image`);
  }
  console.log(`\nsample public URL: ${urls['INV-2244']}`);
  console.log('storage verified');
}

void main().catch((e) => { console.error('storage check failed:', e instanceof Error ? e.message : e); process.exit(1); });
