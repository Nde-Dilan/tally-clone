/**
 * Host authentication & principal resolution for server-side Next.js operations.
 */
import { getSession } from '@/lib/auth-session';
import { getDataStore } from '../db';

export interface HostPrincipal {
  accountId: string;
  memberId: string;
  email: string | null;
  role: 'owner' | 'admin' | 'member';
}

export async function resolveHostPrincipal(req?: Request): Promise<HostPrincipal> {
  const store = getDataStore();

  // 1. Check header if provided (e.g. from API clients / tests)
  let email: string | null = null;
  if (req) {
    email = req.headers.get('x-quill-email');
  }

  // 2. Check session cookie
  if (!email) {
    const session = await getSession();
    if (session && 'email' in session && typeof (session as any).email === 'string') {
      email = (session as any).email;
    }
  }

  // Fallback to default dev email if neither header nor session is present (dev only)
  if (!email && process.env.NODE_ENV !== 'production') {
    email = process.env.DEV_LOGIN_EMAIL || 'alex@example.com';
  }

  if (!email) {
    throw new Error('UNAUTHENTICATED');
  }

  const { account, member } = await store.ensureAccountAndMember(email);
  return {
    accountId: account.id,
    memberId: member.id,
    email: member.email,
    role: member.role,
  };
}
