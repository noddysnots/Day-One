'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import SceneShell from './scene-shell';

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.?!])\s+/)
    .filter(Boolean);
}

/**
 * The real audio, the real transcript. Reveal is paced to actual playback position (currentTime /
 * duration, mapped onto sentence count) rather than word-level timestamps — an approximation, not
 * a forced alignment, but it tracks a real recording closely enough to read as "following along."
 */
export default function SceneVoiceNote({
  voice,
  transcript,
}: {
  voice: { src: string; type: string } | null;
  transcript: string | null;
}) {
  const sentences = transcript ? splitSentences(transcript) : [];
  const [revealed, setRevealed] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !el.duration || !sentences.length) return;
    const share = Math.min(1, el.currentTime / el.duration);
    setRevealed((r) => Math.max(r, Math.ceil(share * sentences.length)));
  };

  return (
    <SceneShell className="max-w-3xl">
      <p className="font-mono text-micro tracking-[0.2em] text-paper/50 uppercase">On her last afternoon</p>
      <h2 className="mt-3 font-display text-title">She records what she knows</h2>

      {voice ? (
        <audio
          ref={audioRef}
          controls
          preload="metadata"
          onTimeUpdate={onTimeUpdate}
          onPlay={() => setRevealed((r) => Math.max(r, 1))}
          className="mt-8 w-full max-w-md"
        >
          <source src={voice.src} type={voice.type} />
        </audio>
      ) : (
        <p className="mt-8 text-body text-paper/70">No recording is on file.</p>
      )}

      <div className="mt-8 max-h-[42vh] overflow-y-auto border border-paper/20 p-5 text-body">
        {sentences.length ? (
          sentences.map((s, i) => (
            <motion.span
              key={i}
              animate={{ opacity: i < revealed ? 1 : 0.14 }}
              transition={{ duration: 0.4 }}
              className="mr-1.5"
            >
              {s}
            </motion.span>
          ))
        ) : (
          <p className="text-paper/60">No transcript is on file.</p>
        )}
      </div>
      <p className="mt-4 font-mono text-micro text-paper/40">Press play — the transcript follows along.</p>
    </SceneShell>
  );
}
