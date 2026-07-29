'use client';

import { useState } from 'react';

/** A scanned sheet, or an honest hole where one should be. Never a broken image icon. */
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
  if (broken) {
    return (
      <div className={`${className} flex items-center justify-center border-rule p-2 text-center`}>
        <span className="font-mono text-micro opacity-60">no scan on file</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- scans come from storage at unknown sizes
  return <img src={src} alt={alt} loading="lazy" className={`block ${className}`} onError={() => setBroken(true)} />;
}
