import { NextResponse } from 'next/server';
import { submissionService } from '@/server/services/submission.service';
import { outboxService } from '@/server/services/outbox.service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ accountCode: string; slug: string }> },
) {
  const { accountCode, slug } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST', message: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = await submissionService.submit(accountCode, slug, body);
  if (!result.ok) {
    const status = result.error === 'NOT_FOUND' ? 404 : 400;
    return NextResponse.json(result, { status });
  }

  // Next.js 16 after() background execution for outbox dispatch
  try {
    const { after } = await import('next/server');
    if (typeof after === 'function') {
      after(async () => {
        await outboxService.drainOnce(10);
      });
    } else {
      void outboxService.drainOnce(10);
    }
  } catch {
    void outboxService.drainOnce(10);
  }

  return NextResponse.json(result, { status: 201 });
}
