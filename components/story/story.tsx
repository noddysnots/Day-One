'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import type { StoryData } from '@/lib/story';
import ProgressDots from './progress-dots';
import SceneColdOpen from './scene-cold-open';
import SceneTeam from './scene-team';
import SceneVoiceNote from './scene-voice-note';
import SceneEmail from './scene-email';
import SceneProbation from './scene-probation';
import SceneScore from './scene-score';
import SceneClosing from './scene-closing';

const SCENE_COUNT = 7;

/**
 * The whole walkthrough: one persistent screen, six scenes swapped by `AnimatePresence`, advanced
 * only by the presenter — click, arrow keys, or space. Nothing here ever autoplays past a beat, so
 * a presenter can linger on any scene mid-sentence without the story running away from them.
 *
 * `MotionConfig reducedMotion="user"` is load-bearing, not decorative: the app's own CSS already
 * zeroes *CSS* animation durations under prefers-reduced-motion, but `motion` animates through the
 * Web Animations API, which that rule cannot see. Without this, a reduced-motion viewer would get
 * full-speed motion here while the rest of the app goes still — or, if a scene ever gates content
 * behind onAnimationComplete, potentially never see that content at all. That is the exact bug this
 * app already shipped once, on the splash screen; this is the fix applied up front instead.
 */
export default function Story({ data }: { data: StoryData }) {
  const [index, setIndex] = useState(0);

  const go = useCallback((next: number) => {
    setIndex((i) => Math.max(0, Math.min(SCENE_COUNT - 1, typeof next === 'number' ? next : i)));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(index - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, go]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 z-40 overflow-hidden bg-ink text-paper">
        <div className="h-full w-full overflow-y-auto">
          <AnimatePresence mode="wait">
            {index === 0 ? <SceneColdOpen key="cold-open" /> : null}
            {index === 1 ? <SceneTeam key="team" /> : null}
            {index === 2 ? <SceneVoiceNote key="voice-note" voice={data.voice} transcript={data.transcript} /> : null}
            {index === 3 ? <SceneEmail key="email" messages={data.emailMessages} /> : null}
            {index === 4 ? <SceneProbation key="probation" cases={data.cases} /> : null}
            {index === 5 ? <SceneScore key="score" root={data.root} amended={data.amended} /> : null}
            {index === 6 ? (
              <SceneClosing key="closing" contractId={data.amended?.contract.id ?? data.root?.contract.id ?? null} />
            ) : null}
          </AnimatePresence>
        </div>

        <Link
          href="/"
          className="fixed top-5 right-5 z-30 font-mono text-micro tracking-[0.1em] text-paper/60 uppercase underline underline-offset-4 hover:text-paper sm:top-8 sm:right-8"
        >
          Esc · Exit
        </Link>

        {index > 0 ? (
          <button
            type="button"
            onClick={() => go(index - 1)}
            className="fixed top-1/2 left-5 z-30 -translate-y-1/2 font-mono text-micro tracking-[0.1em] text-paper/50 uppercase hover:text-paper sm:left-8"
          >
            ← Back
          </button>
        ) : null}
        {index < SCENE_COUNT - 1 ? (
          <button
            type="button"
            onClick={() => go(index + 1)}
            className="fixed top-1/2 right-5 z-30 -translate-y-1/2 font-mono text-micro tracking-[0.1em] text-paper/50 uppercase hover:text-paper sm:right-8"
          >
            Next →
          </button>
        ) : null}

        <ProgressDots total={SCENE_COUNT} current={index} onSelect={go} />
      </div>
    </MotionConfig>
  );
}
