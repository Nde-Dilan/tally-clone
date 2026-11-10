import { NextResponse } from 'next/server';
import { outboxService } from '@/server/services/outbox.service';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Optional security check for Vercel Cron header if CRON_SECRET is configured
  const authHeader = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const result = await outboxService.drainOnce(25);
  return NextResponse.json({
    ok: true,
    result,
    timestamp: Date.now(),
  });
}
