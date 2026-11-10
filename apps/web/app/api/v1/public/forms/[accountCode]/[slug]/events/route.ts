import { NextResponse } from 'next/server';
import { submissionService } from '@/server/services/submission.service';

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

  try {
    const result = await submissionService.event(accountCode, slug, body);
    return NextResponse.json(result, { status: result.ok ? 202 : 400 });
  } catch (err: any) {
    return NextResponse.json({ error: 'SERVER_ERROR', message: String(err?.message || err) }, { status: 500 });
  }
}
