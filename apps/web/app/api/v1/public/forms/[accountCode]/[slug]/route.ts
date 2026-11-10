import { NextResponse } from 'next/server';
import { submissionService } from '@/server/services/submission.service';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ accountCode: string; slug: string }> },
) {
  try {
    const { accountCode, slug } = await ctx.params;
    const form = await submissionService.publicForm(accountCode, slug);
    if (!form) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Form not found.' }, { status: 404 });
    }
    return NextResponse.json(form);
  } catch (err: any) {
    return NextResponse.json({ error: 'SERVER_ERROR', message: String(err?.message || err) }, { status: 500 });
  }
}
