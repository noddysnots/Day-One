'use client';

import { useEffect, useState } from 'react';

/**
 * A dismissible "click here" callout for a first-time visitor, pointing at one interaction that
 * has no other affordance hinting it exists (an image that's actually clickable, a list row that
 * opens a trace). Each hint tracks its own dismissal (`day-one:onboarded:<hintKey>`) rather than
 * one shared flag — these get dropped inline into server components at separate points in the
 * tree, so there's no single mounted instance to hold shared state across them, and independent
 * dismissal is the better behaviour anyway: clearing one shouldn't silently clear the others.
 */
export default function OnboardingHint({
  hintKey,
  children,
  className = '',
}: {
  hintKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  const storageKey = `day-one:onboarded:${hintKey}`;
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(!sessionStorage.getItem(storageKey));
  }, [storageKey]);

  if (!active) return null;

  const dismiss = () => {
    sessionStorage.setItem(storageKey, '1');
    setActive(false);
  };

  return (
    <div
      className={`hud-corners inline-flex items-start gap-2 border border-stamp bg-paper px-3 py-2 text-stamp ${className}`}
    >
      <span className="font-mono text-micro tracking-[0.04em]">{children}</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss hint"
        className="shrink-0 font-mono text-micro leading-none opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
