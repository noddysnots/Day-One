'use client';

import { useState } from 'react';
import Lightbox from './lightbox';

/**
 * A scanned sheet, or an honest hole where one should be. Never a broken image icon. Click opens
 * the full-size scan in a lightbox — a `<span role="button">` rather than a real `<button>`,
 * because case-list.tsx nests this inside its own row button, and a button can't contain another
 * button. `stopPropagation` keeps a click here from also firing the row's own click handler.
 */
export default function DocThumb({
  src,
  alt,
  className = 'aspect-[3/4] w-full bg-paper object-contain object-top',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);

  if (broken) {
    return (
      <div className={`${className} flex items-center justify-center border-rule p-2 text-center`}>
        <span className="font-mono text-micro opacity-60">no scan on file</span>
      </div>
    );
  }

  const openLightbox = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={`Open ${alt} full size`}
        onClick={openLightbox}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openLightbox(e);
          }
        }}
        className="block cursor-zoom-in"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- scans come from storage at unknown sizes */}
        <img src={src} alt={alt} loading="lazy" className={`block ${className}`} onError={() => setBroken(true)} />
      </span>
      {open ? <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
