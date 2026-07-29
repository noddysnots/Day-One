'use client';

import { useCallback, useEffect, useState } from 'react';
import type { IntakeDoc } from '@/lib/intake';
import DocThumb from './doc-thumb';
import { Amount } from './primitives';

/**
 * One scan at a time with a mono counter — the paperwork wow without a 17-cell grid.
 * Lightbox still opens on the image. Reduced motion: instant swap, no slide.
 */
export default function DocCarousel({ docs }: { docs: IntakeDoc[] }) {
  const [index, setIndex] = useState(0);
  const total = docs.length;
  const doc = docs[index] ?? null;

  const go = useCallback(
    (next: number) => {
      if (!total) return;
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, index]);

  if (!doc) {
    return (
      <p className="px-4 py-6 text-small opacity-70">
        No sheets are in the intake folder. Render them with{' '}
        <span className="font-mono">npx tsx scripts/render-docs.ts</span> and copy{' '}
        <span className="font-mono">out/docs</span> into <span className="font-mono">public/docs</span>.
      </p>
    );
  }

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-micro tracking-[0.12em] uppercase opacity-60">
          Scan{' '}
          <span className="text-ink opacity-100">
            {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="hud-corners border border-rule bg-paper px-3 py-1.5 font-mono text-micro tracking-[0.08em] uppercase transition-[border-color] hover:border-ink"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="hud-corners border border-rule bg-paper px-3 py-1.5 font-mono text-micro tracking-[0.08em] uppercase transition-[border-color] hover:border-ink"
          >
            Next →
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] sm:items-start">
        <div className="border border-rule bg-paper">
          <DocThumb
            src={doc.src}
            alt={`Scanned invoice ${doc.invoiceNumber} from ${doc.vendor}`}
            className="aspect-[3/4] w-full bg-paper object-contain object-top"
          />
        </div>
        <div className="space-y-4">
          <div className="border border-rule bg-paper px-4 py-3">
            <p className="font-mono text-micro tracking-[0.12em] uppercase opacity-50">Invoice</p>
            <p className="mt-1 font-mono text-head">{doc.invoiceNumber}</p>
            <p className="mt-3 font-mono text-micro tracking-[0.12em] uppercase opacity-50">Vendor</p>
            <p className="mt-1 text-body">{doc.vendor}</p>
            <p className="mt-3 font-mono text-micro tracking-[0.12em] uppercase opacity-50">Amount</p>
            <p className="mt-1">
              <Amount value={doc.total} className="text-head" />
            </p>
          </div>
          <p className="font-mono text-micro opacity-50">Click the scan to open full size.</p>
          <div className="flex flex-wrap gap-1.5">
            {docs.map((d, i) => (
              <button
                key={d.invoiceNumber}
                type="button"
                aria-label={`Show ${d.invoiceNumber}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => setIndex(i)}
                className={`h-1.5 w-4 border transition-[border-color,background-color] ${
                  i === index ? 'border-ink bg-ink' : 'border-rule bg-transparent hover:border-ink'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
