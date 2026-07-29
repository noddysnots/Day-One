/**
 * Renders each invoice in the corpus as a scanned-looking JPEG.
 *
 * The documents here are generated, not sourced: DocILE is gated behind a registration
 * token and its ungated upstream carries no PO-matched line items. Every figure on the
 * page is read straight off data/corpus.ts, so the paper can never disagree with the
 * ledger. Swap this out for real scans by replacing the buffer this module returns.
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { invoices, vendors, invoiceTotals, lineTotal, type InvoiceSeed, type VendorSeed } from '../data/corpus';

const W = 1240;
const BUYER = ['Aldercroft Manufacturing Co.', '1400 Foundry Road', 'Cleveland, OH 44115'];

const FONTS = [
  { body: 'Georgia, serif', figures: 'Courier New, monospace' },
  { body: 'Arial, Helvetica, sans-serif', figures: 'Arial, Helvetica, sans-serif' },
  { body: 'Times New Roman, Times, serif', figures: 'Times New Roman, Times, serif' },
  { body: 'Verdana, Geneva, sans-serif', figures: 'Courier New, monospace' },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const usd = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

function text(x: number, y: number, s: string, o: { size?: number; font?: string; weight?: string; anchor?: string; fill?: string } = {}) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `font-family="${o.font ?? 'Arial, sans-serif'}"`,
    `font-size="${o.size ?? 15}"`,
    o.weight ? `font-weight="${o.weight}"` : '',
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    `fill="${o.fill ?? '#111'}"`,
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${esc(s)}</text>`;
}

const line = (x1: number, y1: number, x2: number, y2: number, w = 1) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#222" stroke-width="${w}" />`;

function buildSvg(inv: InvoiceSeed, vendor: VendorSeed): { svg: string; height: number } {
  const f = FONTS[inv.layout];
  const { subtotal, tax, total } = invoiceTotals(inv);
  const parts: string[] = [];
  const M = 96;
  let y = 130;

  // --- header: each layout arranges the vendor block and the meta block differently ---
  if (inv.layout === 0) {
    parts.push(text(M, y, vendor.name, { size: 34, font: f.body, weight: 'bold' }));
    parts.push(text(M, y + 26, 'Invoice', { size: 17, font: f.body }));
    parts.push(text(W - M, y - 6, `Invoice ${inv.invoice_number}`, { size: 16, font: f.figures, anchor: 'end' }));
    parts.push(text(W - M, y + 20, longDate(inv.invoice_date), { size: 15, font: f.body, anchor: 'end' }));
    y += 58;
    parts.push(line(M, y, W - M, y, 2));
  } else if (inv.layout === 1) {
    parts.push(text(M, y, 'INVOICE', { size: 30, font: f.body, weight: 'bold' }));
    parts.push(text(M, y + 30, vendor.name, { size: 19, font: f.body }));
    parts.push(`<rect x="${W - M - 300}" y="${y - 34}" width="300" height="96" fill="none" stroke="#222" />`);
    parts.push(text(W - M - 284, y - 10, `No.  ${inv.invoice_number}`, { size: 15, font: f.figures }));
    parts.push(text(W - M - 284, y + 14, `Date  ${inv.invoice_date}`, { size: 15, font: f.figures }));
    parts.push(text(W - M - 284, y + 38, `Terms  ${vendor.payment_terms}`, { size: 15, font: f.figures }));
    y += 92;
  } else if (inv.layout === 2) {
    parts.push(text(W / 2, y, vendor.name, { size: 32, font: f.body, weight: 'bold', anchor: 'middle' }));
    parts.push(text(W / 2, y + 28, 'STATEMENT OF CHARGES', { size: 14, font: f.body, anchor: 'middle' }));
    y += 56;
    parts.push(line(M, y, W - M, y));
    parts.push(text(M, y + 26, `Invoice ${inv.invoice_number}`, { size: 15, font: f.figures }));
    parts.push(text(W - M, y + 26, longDate(inv.invoice_date), { size: 15, font: f.body, anchor: 'end' }));
    y += 44;
  } else {
    parts.push(`<rect x="${M}" y="${y - 34}" width="${W - M * 2}" height="70" fill="#f0efea" stroke="#222" />`);
    parts.push(text(M + 18, y, vendor.name, { size: 26, font: f.body, weight: 'bold' }));
    parts.push(text(W - M - 18, y, inv.invoice_number, { size: 20, font: f.figures, anchor: 'end' }));
    parts.push(text(M + 18, y + 22, `Issued ${inv.invoice_date}`, { size: 13, font: f.body }));
    parts.push(text(W - M - 18, y + 22, vendor.payment_terms, { size: 13, font: f.body, anchor: 'end' }));
    y += 74;
  }

  // --- bill-to and PO reference ---
  y += 46;
  parts.push(text(M, y, 'BILL TO', { size: 11, font: f.body, fill: '#555' }));
  BUYER.forEach((l, i) => parts.push(text(M, y + 22 + i * 20, l, { size: 15, font: f.body })));
  parts.push(text(W - M, y, 'PURCHASE ORDER', { size: 11, font: f.body, anchor: 'end', fill: '#555' }));
  parts.push(
    text(W - M, y + 22, inv.po_number_ref ?? 'none supplied', {
      size: 17,
      font: f.figures,
      anchor: 'end',
      weight: inv.po_number_ref ? 'bold' : 'normal',
    }),
  );
  if (!inv.po_number_ref) parts.push(text(W - M, y + 44, 'verbal order', { size: 13, font: f.body, anchor: 'end' }));

  // --- line items ---
  y += 118;
  const cols = { sku: M, desc: M + 132, qty: W - M - 300, unit: W - M - 170, amt: W - M };
  parts.push(text(cols.sku, y, 'ITEM', { size: 11, font: f.body, fill: '#555' }));
  parts.push(text(cols.desc, y, 'DESCRIPTION', { size: 11, font: f.body, fill: '#555' }));
  parts.push(text(cols.qty, y, 'QTY', { size: 11, font: f.body, anchor: 'end', fill: '#555' }));
  parts.push(text(cols.unit, y, 'UNIT PRICE', { size: 11, font: f.body, anchor: 'end', fill: '#555' }));
  parts.push(text(cols.amt, y, 'AMOUNT', { size: 11, font: f.body, anchor: 'end', fill: '#555' }));
  y += 12;
  parts.push(line(M, y, W - M, y, inv.layout === 2 ? 1 : 2));

  const rowH = 40;
  inv.line_items.forEach((l, i) => {
    const ry = y + 30 + i * rowH;
    if (inv.layout === 1 && i % 2 === 0) {
      parts.push(`<rect x="${M}" y="${ry - 22}" width="${W - M * 2}" height="${rowH}" fill="#f4f3ef" />`);
    }
    parts.push(text(cols.sku, ry, l.sku, { size: 14, font: f.figures }));
    parts.push(text(cols.desc, ry, l.description, { size: 15, font: f.body }));
    parts.push(text(cols.qty, ry, String(l.qty), { size: 15, font: f.figures, anchor: 'end' }));
    parts.push(text(cols.unit, ry, usd(l.unit_price), { size: 15, font: f.figures, anchor: 'end' }));
    parts.push(text(cols.amt, ry, usd(lineTotal(l)), { size: 15, font: f.figures, anchor: 'end' }));
    if (inv.layout === 2) parts.push(line(M, ry + 14, W - M, ry + 14));
  });

  // --- totals ---
  y += 30 + inv.line_items.length * rowH + 12;
  parts.push(line(cols.qty - 40, y, W - M, y));
  const totals: [string, string][] = [['Subtotal', usd(subtotal)]];
  if (tax > 0) totals.push([`Sales tax`, usd(tax)]);
  totals.push(['Total due', usd(total)]);
  totals.forEach(([label, value], i) => {
    const ty = y + 32 + i * 30;
    const last = i === totals.length - 1;
    parts.push(text(cols.unit, ty, label, { size: last ? 17 : 15, font: f.body, anchor: 'end', weight: last ? 'bold' : 'normal' }));
    parts.push(text(cols.amt, ty, value, { size: last ? 19 : 15, font: f.figures, anchor: 'end', weight: last ? 'bold' : 'normal' }));
  });
  const lastY = y + 32 + (totals.length - 1) * 30;
  parts.push(line(cols.unit - 130, lastY + 12, W - M, lastY + 12, 2));

  // --- footer, sized to the content so the sheet is not mostly whitespace ---
  parts.push(text(M, lastY + 92, `Payment terms: ${vendor.payment_terms}. Remit to ${vendor.name}.`, { size: 13, font: f.body }));
  parts.push(text(M, lastY + 116, 'Questions regarding this invoice should be directed to accounts receivable.', { size: 13, font: f.body, fill: '#444' }));
  const footY = lastY + 196;
  parts.push(line(M, footY, W - M, footY));
  parts.push(text(M, footY + 28, `${vendor.name}  ·  invoice ${inv.invoice_number}  ·  page 1 of 1`, { size: 12, font: f.body, fill: '#555' }));

  const height = footY + 96;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}"><rect width="${W}" height="${height}" fill="#fdfdfb" />${parts.join('')}</svg>`;
  return { svg, height };
}

/** Flatten to a slightly skewed, grainy grayscale JPEG so it reads as paper off a scanner. */
export async function renderInvoiceDoc(inv: InvoiceSeed, vendor: VendorSeed): Promise<Buffer> {
  const { svg, height } = buildSvg(inv, vendor);
  const flat = await sharp(Buffer.from(svg)).png().toBuffer();
  const skew = [-0.6, 0.4, -0.35, 0.55][inv.layout];
  const grain = await sharp({
    create: {
      width: W,
      height,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 7 },
    },
  })
    .png()
    .toBuffer();

  return sharp(flat)
    .composite([{ input: grain, blend: 'overlay' }])
    .grayscale()
    .modulate({ brightness: 1.02 })
    .rotate(skew, { background: '#ffffff' })
    .blur(0.4)
    .jpeg({ quality: 84 })
    .toBuffer();
}

export const vendorFor = (key: string): VendorSeed => {
  const v = vendors.find((x) => x.key === key);
  if (!v) throw new Error(`no vendor seeded for key ${key}`);
  return v;
};

async function main() {
  const dir = 'out/docs';
  await mkdir(dir, { recursive: true });
  for (const inv of invoices) {
    const buf = await renderInvoiceDoc(inv, vendorFor(inv.vendor));
    await writeFile(`${dir}/${inv.invoice_number}.jpg`, buf);
    console.log(`${inv.invoice_number}  layout ${inv.layout}  ${(buf.length / 1024).toFixed(0)} kB`);
  }
  console.log(`\n${invoices.length} documents written to ${dir}`);
}

if (process.argv[1]?.includes('render-docs')) void main();
