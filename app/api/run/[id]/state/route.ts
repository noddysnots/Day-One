import { getCases, getRun, getTrace, testCaseCount } from '@/lib/queries';
import { score } from '@/lib/score';
import { toWire, type RunState } from '@/lib/wire';

export const dynamic = 'force-dynamic';

/**
 * One snapshot of a run. The screen polls this while the run is open and stops when it closes,
 * so cases land exactly when their rows land: nothing is staggered on the client.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) return Response.json({ error: 'no such run' }, { status: 404 });

  const [cases, expected] = await Promise.all([getCases(id), testCaseCount()]);
  const asked = new URL(request.url).searchParams.get('case');
  const selected = cases.find((c) => c.id === asked)?.id ?? null;

  const state: RunState = {
    finished: Boolean(run.finished_at),
    scorecard: score(cases, expected),
    cases: cases.map(toWire),
    traceFor: selected,
    trace: selected ? await getTrace(selected) : [],
  };
  return Response.json(state, { headers: { 'cache-control': 'no-store' } });
}
