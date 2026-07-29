'use client';

import Figure from './figure';
import SceneShell from './scene-shell';

/** Same big-name-reveal template already proven on the splash credit screen, retold for Dana — plus
 *  a pictogram that actually walks out of frame, so "she's leaving" is shown, not just stated. */
export default function SceneColdOpen() {
  return (
    <SceneShell className="items-center text-center">
      <p className="name-reveal font-mono text-micro tracking-[0.3em] text-paper/60 uppercase">
        Aldercroft Manufacturing · accounts payable
      </p>
      <h1
        className="name-reveal mt-4 font-display leading-[0.95] uppercase"
        style={{ fontSize: 'clamp(2.5rem, 11vw, 8rem)', animationDelay: '90ms' }}
      >
        Dana Whitfield
      </h1>
      <p
        className="name-reveal mt-5 font-mono text-small tracking-[0.08em] text-paper/80"
        style={{ animationDelay: '220ms' }}
      >
        Controller · on leave, starting today
      </p>
      <p className="name-reveal mt-10 max-w-xl text-body text-paper/70" style={{ animationDelay: '360ms' }}>
        Everything she knows about paying invoices is about to leave the building with her — unless she
        can get it out of her head before she goes.
      </p>

      <div className="walk-off mt-12">
        <Figure pose="forward" className="h-20 w-12 text-paper/60" />
      </div>
    </SceneShell>
  );
}
