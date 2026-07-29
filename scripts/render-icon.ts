/**
 * Renders app/favicon.ico. Next serves that file at /favicon.ico and links it from every page, so
 * one file answers both the 404 and the blank tab.
 *
 * The mark is a filled-in register line: ink ground, three paper rules, the last one short the way
 * a part-entered row is. Only the two colours the rest of the interface uses, no logo, and nothing
 * that has to be recognised to be read at 16px.
 *
 * Usage: npx tsx scripts/render-icon.ts
 */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const INK = '#14161a';
const PAPER = '#faf9f6';

/**
 * Laid out on a 16 unit grid, which is the smallest size it has to survive. Every edge is a whole
 * unit, so at 16, 32 and 48 px — 1x, 2x and 3x — each one still lands on a pixel boundary and the
 * rules stay ink and paper instead of averaging to grey.
 */
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect width="16" height="16" fill="${INK}"/>
  <rect x="3" y="3" width="10" height="2" fill="${PAPER}"/>
  <rect x="3" y="7" width="10" height="2" fill="${PAPER}"/>
  <rect x="3" y="11" width="6" height="2" fill="${PAPER}"/>
</svg>`;

/**
 * An .ico is a 6-byte directory, one 16-byte entry per size, then the images. Every browser in use
 * takes PNG payloads inside the container, so the PNGs sharp produces go in whole.
 */
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries: Buffer[] = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width, 0 means 256
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette size, 0 for truecolour
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) {
    // density scales the SVG rasteriser itself, so each size is drawn from the vector rather than
    // resampled down from a bigger bitmap.
    const png = await sharp(Buffer.from(svg), { density: 72 * (size / 16) })
      .resize(size, size)
      .png()
      .toBuffer();
    images.push({ size, png });
    console.log(`  ${size}x${size}  ${png.length} bytes`);
  }

  const buf = ico(images);
  await writeFile('app/favicon.ico', buf);
  console.log(`\napp/favicon.ico  ${buf.length} bytes, ${sizes.join('/')} px`);

  // Read it back and check the container describes what is actually in it.
  const { readFile } = await import('node:fs/promises');
  const back = await readFile('app/favicon.ico');
  if (back.readUInt16LE(2) !== 1) throw new Error('not an icon container');
  const count = back.readUInt16LE(4);
  if (count !== sizes.length) throw new Error(`container declares ${count} images, ${sizes.length} were written`);
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const declared = back.readUInt8(at) || 256;
    const length = back.readUInt32LE(at + 8);
    const start = back.readUInt32LE(at + 12);
    const meta = await sharp(back.subarray(start, start + length)).metadata();
    console.log(`  entry ${i}: declares ${declared}px, payload is ${meta.format} ${meta.width}x${meta.height}`);
    if (meta.width !== declared || meta.height !== declared) throw new Error('an entry does not match its payload');
  }
  console.log('Container agrees with its contents.');

  // The 16px entry blown up with no smoothing, so the mark can be judged as a tab actually draws it.
  const { mkdir } = await import('node:fs/promises');
  await mkdir('out/shots', { recursive: true });
  const first = { start: back.readUInt32LE(6 + 12), length: back.readUInt32LE(6 + 8) };
  await writeFile(
    'out/shots/favicon-16-enlarged.png',
    await sharp(back.subarray(first.start, first.start + first.length))
      .resize(160, 160, { kernel: 'nearest' })
      .png()
      .toBuffer(),
  );
  console.log('  preview  out/shots/favicon-16-enlarged.png');
}

void main().catch((e) => {
  console.error('\nicon failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
