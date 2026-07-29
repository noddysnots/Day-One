import { compileRulebook } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** NDJSON: one CompileEvent per line, flushed as it happens. No progress bar, just what is true. */
export async function POST() {
  const encode = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encode.encode(JSON.stringify(event) + '\n'));
      try {
        for await (const event of compileRulebook()) send(event);
      } catch (error) {
        send({
          kind: 'fault',
          what: `The compile stopped: ${error instanceof Error ? error.message : String(error)}`,
          fix: 'Check the server log for the full trace, then start the compile again.',
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}
