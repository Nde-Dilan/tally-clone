import { NextResponse } from 'next/server';
import { getDataStore } from '@/server/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const store = getDataStore();
    return NextResponse.json({
      status: 'ok',
      service: 'forms-next-api',
      dialect: store.dialect,
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: 'degraded', error: String(err?.message || err) },
      { status: 500 },
    );
  }
}
