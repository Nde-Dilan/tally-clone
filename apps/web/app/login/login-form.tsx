'use client';

import { useActionState } from 'react';
import type { FormsMessages } from '@quill/shared';
import { signInAction } from './actions';

export function LoginForm({ messages: m }: { messages: FormsMessages['admin']['login'] }) {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">{m.emailLabel || 'Email address'}</span>
        <input
          name="email"
          type="email"
          required
          autoFocus
          autoComplete="email"
          placeholder={m.emailPlaceholder || 'alex@example.com'}
          aria-invalid={state?.error ? true : undefined}
          className="rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">Password</span>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          aria-invalid={state?.error ? true : undefined}
          className="rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-foreground transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      {state?.error ? (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          {state.error === 'invalid_email'
            ? m.emailInvalid || 'Please enter a valid email address.'
            : state.error === 'invalid_password'
              ? 'Invalid password. Please check your password and try again.'
              : 'Invalid email or password.'}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground transition-all hover:opacity-95 active:scale-[0.99] disabled:opacity-60 cursor-pointer"
      >
        {pending ? 'Signing in…' : m.continue || 'Sign in'}
      </button>
    </form>
  );
}
