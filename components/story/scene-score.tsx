'use client';

import type { StoryData } from '@/lib/story';
import RunDiff from '../run-diff';
import BarCompare from './bar-compare';
import SceneShell from './scene-shell';

export default function SceneScore({ root, amended }: { root: StoryData['root']; amended: StoryData['amended'] }) {
  return (
    <SceneShell className="max-w-4xl">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">Then you fix what it got wrong</p>
      <h2 className="mt-3 font-display text-title">And the score moves</h2>

      {root && amended ? (
        <>
          <div className="mt-8">
            <BarCompare before={root.scorecard} after={amended.scorecard} />
          </div>
          <div className="mt-8 bg-paper p-1 text-ink">
            <RunDiff cases={amended.cases} base={amended.diffBase} />
          </div>
        </>
      ) : root ? (
        <p className="mt-8 max-w-xl text-body text-paper/70">
          Version {root.contract.version} scored {root.scorecard.correct} of {root.scorecard.total} against the
          controller&rsquo;s own calls. Amend it and run it again to see this scene compare the two.
        </p>
      ) : (
        <p className="mt-8 text-body text-paper/70">No scored run is on file yet.</p>
      )}
    </SceneShell>
  );
}
