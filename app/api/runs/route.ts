import { startRun } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { contractId?: string };
  const result = await startRun(body.contractId ?? '');
  if ('fault' in result) return Response.json(result.fault, { status: 503 });
  return Response.json(result);
}
