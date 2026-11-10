import { NextResponse } from 'next/server';
import { resolveHostPrincipal } from '@/server/auth/host-auth';
import { adminService } from '@/server/services/admin.service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const principal = await resolveHostPrincipal(req);
    const me = await adminService.me(principal);
    return NextResponse.json(me);
  } catch (err: any) {
    if (err?.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'UNAUTHENTICATED', message: 'No session.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'SERVER_ERROR', message: String(err?.message || err) }, { status: 500 });
  }
}
