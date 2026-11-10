import { NextResponse } from 'next/server';
import { resolveHostPrincipal } from '@/server/auth/host-auth';
import { adminService } from '@/server/services/admin.service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const principal = await resolveHostPrincipal(req);
    const sp = new URL(req.url).searchParams;
    const from = sp.get('from') ? Number(sp.get('from')) : undefined;
    const to = sp.get('to') ? Number(sp.get('to')) : undefined;
    const tz = sp.get('tz') ?? undefined;
    const analytics = await adminService.getAnalytics(principal.accountId, id, { from, to, tz });
    return NextResponse.json(analytics);
  } catch (err: any) {
    if (err?.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'No session.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'SERVER_ERROR', message: String(err?.message || err) }, { status: 500 });
  }
}
