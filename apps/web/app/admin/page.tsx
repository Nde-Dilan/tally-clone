import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDate, getMessages, t } from '@quill/shared';
import { adminApi } from '@/lib/admin-api';
import { getLocale } from '@/lib/locale';
import { greetingName } from '@/lib/person';
import { publishedWorkspacePagePath } from '@/lib/public-page';
import { CopyLink } from '@/components/copy-link';
import { CreateForm } from './forms/create-form';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const locale = await getLocale();
  const messages = getMessages(locale).admin;
  const h = messages.home;
  const [me, forms, linkPage] = await Promise.all([
    adminApi.me(),
    adminApi.listForms(),
    // Missing or unreadable page reads as "not published": the box hides.
    adminApi.linkPage().catch(() => null),
  ]);

  // Aggregate submissions + completion across every form
  const analytics = await Promise.all(
    forms.map((f) => adminApi.getAnalytics(f.id).catch(() => null)),
  );
  const totalSubmissions = analytics.reduce((n, a) => n + (a?.submissions ?? 0), 0);
  const totalStarts = analytics.reduce((n, a) => n + (a?.starts ?? 0), 0);
  const completionRate =
    totalStarts > 0 ? Math.min(100, Math.round((totalSubmissions / totalStarts) * 1000) / 10) : 0;

  const publicUrl = publishedWorkspacePagePath(me.accountCode, linkPage?.page);
  const firstName = greetingName(me.displayName, me.email);
  const createLabels = {
    create: messages.forms.create,
    createTitle: messages.forms.createTitle,
    nameLabel: messages.forms.nameLabel,
    namePlaceholder: messages.forms.namePlaceholder,
    nameRequired: messages.forms.nameRequired,
    cancel: messages.forms.cancel,
    layoutLabel: messages.forms.layoutLabel,
    layoutSlides: messages.forms.layoutSlides,
    layoutSlidesDesc: messages.forms.layoutSlidesDesc,
    layoutVertical: messages.forms.layoutVertical,
    layoutVerticalDesc: messages.forms.layoutVerticalDesc,
  };

  const formRows = forms
    .map((f, i) => ({ form: f, analytics: analytics[i] ?? null }))
    .sort((a, b) => b.form.updatedAt - a.form.updatedAt);
  const picker = messages.picker;
  const zone = me.timezone ?? 'UTC';

  return (
    <div className="mx-auto max-w-[1520px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">
            {firstName ? t(h.welcomeNamed, { name: firstName }) : h.welcome}
          </h1>
          <p className="text-3xl font-bold tracking-tight text-faint">{h.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {publicUrl ? (
            <div
              data-testid="home-public-page"
              title={h.publicLink}
              className="flex h-10 min-w-0 max-w-full items-center rounded-full border border-border bg-sidebar pl-4 pr-3"
            >
              <CopyLink path={publicUrl} labels={{ copy: h.copy, copied: h.copied, open: h.open }} />
            </div>
          ) : null}
          <CreateForm labels={createLabels} />
        </div>
      </div>

      {/* Overview Stats Row */}
      <div className="mb-10 grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
        <Stat label={h.statForms} value={String(forms.length)} href="/admin/forms" />
        <Stat label={h.statSubmissions} value={String(totalSubmissions)} href="/admin/submissions" />
        <Stat label="Total Starts" value={String(totalStarts)} href="/admin/analytics" />
        <Stat
          label={h.statCompletion}
          value={`${completionRate}%`}
          note={h.statCompletionNote}
          href="/admin/analytics"
        />
      </div>

      {/* Current Forms Section */}
      <section aria-labelledby="home-forms-heading" className="min-w-0">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 id="home-forms-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Current Forms
            </h2>
            <p className="text-xs text-muted-foreground">
              Active questionnaires with direct links, responses, and real-time conversion metrics.
            </p>
          </div>
          <Link href="/admin/forms" className="text-sm font-medium text-foreground hover:underline">
            {h.viewAll}
          </Link>
        </div>

        {formRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center">
            <i className="pi pi-file-edit mb-3 text-3xl text-faint" />
            <p className="text-sm font-medium text-foreground">{messages.forms.emptyBody}</p>
            <div className="mt-4 flex justify-center">
              <CreateForm labels={createLabels} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {formRows.map(({ form, analytics: a }) => {
              const submissions = a?.submissions ?? 0;
              const starts = a?.starts ?? 0;
              const rate = a?.completionRate ?? (starts > 0 ? (submissions / starts) * 100 : 0);
              const publicPath = `/${me.accountCode}/f/${form.slug}`;

              return (
                <div
                  key={form.id}
                  data-testid="home-form-card"
                  className="group flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-foreground/30 hover:shadow-sm sm:flex-row sm:items-center"
                >
                  {/* Form Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" title="Published" />
                      <Link
                        href={`/admin/forms/${form.id}/edit`}
                        className="truncate text-base font-semibold text-foreground hover:underline"
                      >
                        {form.name}
                      </Link>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                        {publicPath}
                      </code>
                      <span>•</span>
                      <span>Updated {formatDate(form.updatedAt, { locale, timeZone: zone })}</span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-6 sm:px-4">
                    <div className="flex flex-col text-left sm:text-right">
                      <span className="text-sm font-semibold text-foreground tabular-nums">
                        {t(picker.submissionsCount, { n: submissions })}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {starts} starts
                      </span>
                    </div>
                    <div className="hidden w-28 sm:block">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Rate</span>
                        <span className="font-medium tabular-nums text-foreground">{Math.round(rate)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t border-border pt-3 sm:border-t-0 sm:pt-0">
                    <a
                      href={publicPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="Open public form in a new tab"
                    >
                      <i className="pi pi-external-link text-[11px]" />
                      <span>Open Form</span>
                    </a>
                    <Link
                      href={`/admin/forms/${form.id}/edit`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="Edit form layout and questions"
                    >
                      <i className="pi pi-file-edit text-[11px]" />
                      <span>Edit</span>
                    </Link>
                    <Link
                      href={`/admin/forms/${form.id}/analytics`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="View completion time and drop-off analytics"
                    >
                      <i className="pi pi-chart-bar text-[11px]" />
                      <span>Analytics</span>
                    </Link>
                    <Link
                      href={`/admin/forms/${form.id}/submissions`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                      title="Inspect form responses"
                    >
                      <i className="pi pi-inbox text-[11px]" />
                      <span>Submissions</span>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Useful Shortcuts */}
      <section aria-labelledby="home-shortcuts" className="mt-10">
        <h2 id="home-shortcuts" className="sr-only">
          {h.shortcuts}
        </h2>
        <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl border border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <Shortcut href="/admin/account/brand-kit" icon="pi-palette" title={h.branding} desc={h.brandingDesc} />
          <Shortcut href="/admin/account/public-page" icon="pi-globe" title={h.publicLink} desc={h.publicPageDesc} />
        </div>
      </section>
    </div>
  );
}

/** How many forms the recent list shows before "View all" takes over. */
const RECENT_LIMIT = 6;

/** A section label: small, tracked, quiet. Sans, like every label in the app. */
const EYEBROW = 'text-xs font-medium uppercase tracking-wider text-faint';

function Stat({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: string;
  /** What the figure is a share of, set beside it in the quiet voice. */
  note?: string;
  href: string;
}): ReactNode {
  return (
    <Link href={href} className="flex flex-col gap-2 bg-card p-6 transition-colors hover:bg-sidebar">
      <span className={EYEBROW}>{label}</span>
      {/* Set in the SANS, not the mono: a headline figure is something you glance
          at, and a monospaced one reads as a code sample. `tabular-nums` is what
          actually stops the number jittering as it updates. */}
      <span className="flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight tabular-nums">{value}</span>
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
      </span>
    </Link>
  );
}

function Shortcut({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: string;
  title: string;
  desc: string;
}): ReactNode {
  return (
    <Link href={href} className="group flex items-center gap-4 bg-card p-6 transition-colors hover:bg-sidebar">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-foreground">
        <i aria-hidden className={`pi ${icon}`} style={{ fontSize: 16 }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{desc}</span>
      </span>
      <i
        aria-hidden
        className="pi pi-arrow-right shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        style={{ fontSize: 14 }}
      />
    </Link>
  );
}
