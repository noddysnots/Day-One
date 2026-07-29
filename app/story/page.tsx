import type { DiffBase } from '@/components/run-diff';
import Story from '@/components/story/story';
import { EmptyScreen } from '@/components/primitives';
import { verdictTag } from '@/lib/copy';
import { emailThread, voiceNote } from '@/lib/intake';
import { parseEmailThread, pickRepresentative, type StoryData } from '@/lib/story';
import { getCases, getTrace, latestRunFor, storyContracts, testCaseCount } from '@/lib/queries';
import { score } from '@/lib/score';
import { toWire } from '@/lib/wire';

export const dynamic = 'force-dynamic';

/**
 * Everything the walkthrough needs, fetched once, server-side. Once this page has loaded, nothing
 * in /story touches the database again — the whole point is a presenter can go on stage without a
 * live model call or a live query standing between them and the next click.
 */
export default async function StoryPage() {
  const { root, amended } = await storyContracts();

  if (!root) {
    return (
      <EmptyScreen
        title="Nothing to walk through yet"
        what="The story needs a compiled contract with a scored driving test on file."
        fix="Compile a contract from the handover and run the driving test at least once, then reload this page."
      />
    );
  }

  const rootRun = await latestRunFor(root.id);
  if (!rootRun || !rootRun.finished_at) {
    return (
      <EmptyScreen
        title="The probation run isn't finished yet"
        what="The story needs a completed driving test to show real reasoning and a real score."
        fix="Let the current run finish, then reload this page."
      />
    );
  }

  const [rootCases, expected, emailMd, voice] = await Promise.all([
    getCases(rootRun.id),
    testCaseCount(),
    emailThread(),
    Promise.resolve(voiceNote()),
  ]);

  const rootWire = rootCases.map(toWire);
  const picked = pickRepresentative(rootWire);

  const [cleanTrace, judgedTrace, missTrace] = await Promise.all([
    picked.clean ? getTrace(picked.clean.id) : Promise.resolve([]),
    picked.judged ? getTrace(picked.judged.id) : Promise.resolve([]),
    picked.miss ? getTrace(picked.miss.id) : Promise.resolve([]),
  ]);

  let amendedData: StoryData['amended'] = null;
  if (amended) {
    const amendedRun = await latestRunFor(amended.id);
    if (amendedRun?.finished_at) {
      const amendedCases = await getCases(amendedRun.id);
      const diffBase: DiffBase = {
        runId: rootRun.id,
        version: root.version,
        cases: Object.fromEntries(rootCases.map((c) => [c.invoice.invoice_number, { action: c.action, correct: c.correct }])),
      };
      amendedData = {
        contract: amended,
        run: amendedRun,
        scorecard: score(amendedCases, expected),
        cases: amendedCases.map(toWire),
        diffBase,
      };
    }
  }

  const data: StoryData = {
    root: { contract: root, run: rootRun, scorecard: score(rootCases, expected) },
    amended: amendedData,
    cases: {
      clean: picked.clean
        ? { wire: picked.clean, trace: cleanTrace, verdict: verdictTag({ correct: picked.clean.correct, failureMode: picked.clean.failureMode }) }
        : null,
      judged: picked.judged
        ? { wire: picked.judged, trace: judgedTrace, verdict: verdictTag({ correct: picked.judged.correct, failureMode: picked.judged.failureMode }) }
        : null,
      miss: picked.miss
        ? { wire: picked.miss, trace: missTrace, verdict: verdictTag({ correct: picked.miss.correct, failureMode: picked.miss.failureMode }) }
        : null,
    },
    voice,
    transcript: root.transcript,
    emailMessages: emailMd ? parseEmailThread(emailMd) : [],
  };

  return <Story data={data} />;
}
