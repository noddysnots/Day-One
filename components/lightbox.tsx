'use client';

import { useEffect } from 'react';

/** Full-size image over everything, dismissed by Escape, backdrop click, or the close control. */
export default function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/90 p-6 sm:p-12"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed top-5 right-5 font-mono text-micro tracking-[0.1em] text-paper uppercase underline underline-offset-4 hover:opacity-80"
      >
        Close ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- scans come from storage at unknown sizes */}
      <img
        src={src}
        alt={alt}
        className="max-h-full max-w-full bg-paper object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
