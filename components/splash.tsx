'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

const LINES = [
  'loading employment contract',
  'granting tool access ....... 8 scopes',
  'connecting to ledger',
  'probation period',
];
const SEEN = 'day-one:booted';
/** Ignore a dismiss click/keypress in the first stretch — the click that opened the tab, or a
 *  stray keypress from the address bar, would otherwise clear the credit before it's ever read. */
const DISMISS_GRACE_MS = 400;
const REVEAL_AT_MS = 500;
const LEAVE_AT_MS = 3800;
const LEAVE_DURATION_MS = 350;

/**
 * Boot log in the corner, then the credit — full-screen, the name large enough to actually be
 * seen, animating in rather than fading. Once per session; reduced motion skips straight to the
 * held state instead of hiding it. ?boot=1 forces a replay for QA and demos. Decided on the client
 * so the markup cannot mismatch.
 *
 * From the home page, if the presenter lets the credit play out, it continues into /story. A click
 * or keypress is treated as interruption, not consent: the splash fades and the visitor stays on
 * the page they were trying to use (expand the email, open an invoice). Hijacking that click into
 * /story was the bug that made intake feel broken.
 *
 * `useTransition`'s `isPending` tracks the /story server fetch, so when we *do* auto-advance the
 * fade waits until the story is actually there to reveal — not a fixed timer that would flash
 * Intake underneath.
 */
export default function Splash() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [lines, setLines] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [departed, setDeparted] = useState(false);
  const toStory = pathname === '/';

  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).has('boot');
    if (!forced && sessionStorage.getItem(SEEN)) return;
    sessionStorage.setItem(SEEN, '1');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setMounted(true);
    const timers: number[] = [];
    let closed = false;

    const fadeOut = () => {
      if (closed) return;
      closed = true;
      setLeaving(true);
      timers.push(window.setTimeout(() => setMounted(false), LEAVE_DURATION_MS));
    };

    // Timer path only: the credit finished unread, advance into the walkthrough.
    const advanceToStory = () => {
      if (closed) return;
      closed = true;
      if (toStory) {
        setDeparted(true);
        startTransition(() => router.push('/story'));
      } else {
        fadeOut();
      }
    };

    // Click / key: the visitor is trying to use the page underneath. Stay put.
    const dismiss = () => {
      if (closed) return;
      clearTimeout(grace);
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
      fadeOut();
    };

    if (reduced) {
      setLines(LINES.length);
      setRevealed(true);
    } else {
      setLines(1);
      [1, 2, 3].forEach((i) => timers.push(window.setTimeout(() => setLines(i + 1), i * 90)));
      timers.push(window.setTimeout(() => setRevealed(true), REVEAL_AT_MS));
    }
    timers.push(window.setTimeout(advanceToStory, LEAVE_AT_MS));

    const grace = window.setTimeout(() => {
      if (closed) return;
      window.addEventListener('keydown', dismiss);
      window.addEventListener('pointerdown', dismiss);
    }, DISMISS_GRACE_MS);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(grace);
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- toStory/router/startTransition are
    // stable for the life of this one-shot boot sequence; re-running this effect on their account
    // would restart the whole timer chain.
  }, []);

  // Fires once the /story navigation actually lands (isPending flips false) — never earlier, or
  // the fade would reveal Intake mid-fetch instead of the story it's supposed to open on.
  useEffect(() => {
    if (!departed || isPending) return;
    setLeaving(true);
    const t = window.setTimeout(() => setMounted(false), LEAVE_DURATION_MS);
    return () => clearTimeout(t);
  }, [departed, isPending]);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-ink text-paper transition-opacity duration-[350ms] ${leaving ? 'opacity-0' : 'opacity-100'}`}
      aria-hidden
    >
      <div className={`absolute top-6 left-6 font-mono text-micro opacity-50 transition-opacity duration-500 sm:top-10 sm:left-10 ${revealed ? 'opacity-20' : ''}`}>
        {LINES.slice(0, lines).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        {revealed ? (
          <>
            <h1
              className="name-reveal font-display leading-[0.95] uppercase"
              style={{ fontSize: 'clamp(2.75rem, 12vw, 9rem)' }}
            >
              Day One
            </h1>
            <p
              className="name-reveal mt-6 font-mono text-micro tracking-[0.3em] text-paper/60 uppercase"
              style={{ animationDelay: '180ms' }}
            >
              Built by
            </p>
            <h2
              className="name-reveal mt-2 font-display leading-[0.95] uppercase"
              style={{ fontSize: 'clamp(2rem, 8vw, 6rem)', animationDelay: '260ms' }}
            >
              Sarthak Pant
            </h2>
            <p
              className="name-reveal mt-5 flex items-center gap-2 font-mono text-small tracking-[0.08em]"
              style={{ animationDelay: '400ms' }}
            >
              <span className="led" />
              AI Product Manager
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
