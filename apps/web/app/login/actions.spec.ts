import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const clearSession = vi.fn();
const revokeUpstreamSession = vi.fn();
const setSession = vi.fn();
const authProvider = vi.fn();
vi.mock('@/lib/auth-session', async () => {
  // idpLogoutTarget is pure; the real one runs so the tests exercise the actual
  // return_to construction instead of a mirror of it.
  const actual = await vi.importActual<typeof import('@/lib/auth-session')>('@/lib/auth-session');
  return {
    idpLogoutTarget: actual.idpLogoutTarget,
    getSession: (...a: unknown[]) => getSession(...a),
    clearSession: (...a: unknown[]) => clearSession(...a),
    revokeUpstreamSession: (...a: unknown[]) => revokeUpstreamSession(...a),
    setSession: (...a: unknown[]) => setSession(...a),
    authProvider: () => authProvider(),
  };
});

const redirect = vi.fn((url: string) => {
  // Mirror Next's real behavior: redirect() throws, ending the action.
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(async () => new Headers({ host: 'forms.example.com', 'x-forwarded-proto': 'https' })),
}));

import { signInAction, signOutAction } from './actions';

const workosSession = { provider: 'workos', accessToken: 'tok', sessionId: 'session_123' };

describe('signInAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects invalid email', async () => {
    const fd = new FormData();
    fd.set('email', 'not-an-email');
    fd.set('password', 'admin123');
    const res = await signInAction(null, fd);
    expect(res).toEqual({ error: 'invalid_email' });
  });

  it('rejects empty password', async () => {
    const fd = new FormData();
    fd.set('email', 'alex@example.com');
    fd.set('password', '');
    const res = await signInAction(null, fd);
    expect(res).toEqual({ error: 'invalid_password' });
  });

  it('rejects wrong password when ADMIN_PASSWORD is set', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'supersecret');
    const fd = new FormData();
    fd.set('email', 'alex@example.com');
    fd.set('password', 'wrongpassword');
    const res = await signInAction(null, fd);
    expect(res).toEqual({ error: 'invalid_password' });
  });

  it('accepts correct password and sets session', async () => {
    vi.stubEnv('ADMIN_PASSWORD', 'supersecret');
    const fd = new FormData();
    fd.set('email', 'alex@example.com');
    fd.set('password', 'supersecret');
    await expect(signInAction(null, fd)).rejects.toThrow('NEXT_REDIRECT:/admin');
    expect(setSession).toHaveBeenCalledWith({ provider: 'local', email: 'alex@example.com' });
  });
});

describe('signOutAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('PUBLIC_APP_URL', 'https://forms.example.com');
    revokeUpstreamSession.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('workos: never follows the IdP logout URL (Orbit contract, skipIdpRedirect = true)', async () => {
    authProvider.mockReturnValue('workos');
    getSession.mockResolvedValue(workosSession);
    revokeUpstreamSession.mockResolvedValue('https://api.workos.com/user_management/sessions/logout?session_id=session_123');

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT:/login?signedout=1');

    // Read-then-clear: clearing first hands the revoke a null session (the
    // pre-#82 bug that left the upstream session alive).
    expect(getSession.mock.invocationCallOrder[0]).toBeLessThan(clearSession.mock.invocationCallOrder[0]!);
    expect(revokeUpstreamSession).toHaveBeenCalledWith(workosSession);
    expect(clearSession).toHaveBeenCalled();
  });

  it('workos: lands locally signed out when the IAM hands back no logout URL', async () => {
    authProvider.mockReturnValue('workos');
    getSession.mockResolvedValue(workosSession);
    revokeUpstreamSession.mockResolvedValue(null);

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT:/login?signedout=1');

    expect(clearSession).toHaveBeenCalled();
  });

  it('workos: still clears and lands locally when the session is already gone', async () => {
    authProvider.mockReturnValue('workos');
    getSession.mockResolvedValue(null);

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT:/login?signedout=1');

    expect(clearSession).toHaveBeenCalled();
    expect(revokeUpstreamSession).toHaveBeenCalledWith(null);
  });

  it('local: clears and lands on plain /login without touching the IAM helper contract', async () => {
    authProvider.mockReturnValue('local');
    getSession.mockResolvedValue({ provider: 'local', email: 'a@b.c' });

    await expect(signOutAction()).rejects.toThrow('NEXT_REDIRECT:/login');

    expect(clearSession).toHaveBeenCalled();
  });
});
