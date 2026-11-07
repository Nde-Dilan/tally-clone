import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { AnalyticsResponse } from '@quill/types';
import { dayBoundsInZone, getMessages, isoDateInZone, t, type FormsMessages } from '@quill/shared';
import { adminApi, ApiError } from '@/lib/admin-api';
import { getLocale } from '@/lib/locale';
import { FormTabs } from '@/components/ui/form-tabs';
import { Skeleton } from '@/components/skeleton';
import { AnalyticsFilter } from './analytics-filter';
import { TrendsChart } from './trends-chart';

export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

type SP = { preset?: string; from?: string; to?: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Resolve the URL query into an epoch-ms range the API understands.
 *
 * Day boundaries are resolved HERE, on the server, in the WORKSPACE's zone:
 * an analytics number has to be the same for every teammate reading it, so
 * it depends on the one zone the team shares, never on the viewer's clock.
 * "Last week/month/year" are rolling 7/30/365-day windows, matching how the
 * presets read in Typeform.
 */
function resolveRange(sp: SP, zone: string): { from?: number; to?: number } {
  if (sp.preset === 'custom') {
    return {
      from: sp.from && ISO_DATE.test(sp.from) ? dayBoundsInZone(sp.from, zone).from : undefined,
      to: sp.to && ISO_DATE.test(sp.to) ? dayBoundsInZone(sp.to, zone).to : undefined,
    };
  }
  const now = Date.now();
  const today = dayBoundsInZone(isoDateInZone(now, zone), zone);
  if (sp.preset === 'today') return { from: today.from, to: today.to };
  const days = sp.preset === 'week' ? 7 : sp.preset === 'month' ? 30 : sp.preset === 'year' ? 365 : null;
  // Send BOTH bounds for a rolling window. With only `from`, the trend series
  // ended at the last day that happened to have data, so a quiet stretch made
  // the chart stop short of today and silently misrepresent the window.
  //
  // `from` snaps to a whole local day so the window is N COMPLETE days ending
  // today. Cutting at `now - N days` (an intra-day instant) left the oldest
  // bucket holding only part of its day while the chart drew it as a full one.
  if (days) {
    const firstDay = isoDateInZone(today.from - (days - 1) * DAY_MS + DAY_MS / 2, zone);
    return { from: dayBoundsInZone(firstDay, zone).from, to: now };
  }
  return {};
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const m = getMessages(locale).admin;
  // The workspace zone names the days: the range cuts, the buckets, the picker's "today".
  const [me, form] = await Promise.all([
    adminApi.me(),
    adminApi.getForm(id).catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    }),
  ]);
  const zone = me.timezone ?? 'UTC';
  const range = resolveRange(sp, zone);
  const rangeKey = `${sp.preset ?? 'all'}:${sp.from ?? ''}:${sp.to ?? ''}:${zone}`;

  return (
    <div>
      <FormTabs
        formId={id}
        active="analytics"
        labels={{ ...m.nav, forms: m.chrome.nav.forms }}
        name={form.name}
        hasDraft={form.draftConfig != null}
        statusLabels={m.forms}
        actions={
          <AnalyticsFilter
            locale={locale}
            todayIso={isoDateInZone(Date.now(), zone)}
            labels={{
              today: m.analytics.rangeToday,
              week: m.analytics.rangeWeek,
              month: m.analytics.rangeMonth,
              year: m.analytics.rangeYear,
              all: m.analytics.rangeAll,
              custom: m.analytics.rangeCustom,
              from: m.analytics.rangeFrom,
              to: m.analytics.rangeTo,
              apply: m.analytics.rangeApply,
            }}
          />
        }
      />
      <div className="mx-auto max-w-[1520px] px-6 py-6 sm:px-8">
        <Suspense key={rangeKey} fallback={<AnalyticsSkeleton />}>
          <AnalyticsData id={id} range={range} zone={zone} m={m.analytics} locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Format seconds as `Ns`, `Nm Ss` or `Nh Nm`. The hour tier matters: a session
 * left open across days used to render as "4440m", which reads as noise rather
 * than a duration.
 */
function formatDuration(seconds: number, unit: string): string {
  if (seconds < 60) return `${seconds}${unit}`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s === 0 ? `${m}m` : `${m}m ${s}${unit}`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  // Rounding the remainder can land on a full hour — "1h 60m" is not a duration.
  if (m === 60) return `${h + 1}h`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

async function AnalyticsData({
  id,
  range,
  zone,
  m,
  locale,
}: {
  id: string;
  range: { from?: number; to?: number };
  zone: string;
  m: FormsMessages['admin']['analytics'];
  locale: string;
}) {
  let a: AnalyticsResponse;
  try {
    a = await adminApi.getAnalytics(id, { ...range, tz: zone });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const hasActivity = a.views + a.starts + a.submissions + a.partialSubmits + a.bookings > 0;
  if (!hasActivity) {
    // A filtered range with no activity is NOT the same as a form nobody has
    // ever opened — telling an owner with 500 responses "once people open your
    // form…" because they picked last week is simply wrong.
    const filtered = range.from != null || range.to != null;
    return (
      <div className="rounded-2xl border border-dashed border-border p-12 text-center">
        <p className="text-lg font-medium">{filtered ? m.emptyRangeTitle : m.emptyTitle}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {filtered ? m.emptyRangeBody : m.emptyBody}
        </p>
      </div>
    );
  }

  const cards = [
    { label: m.metricViews, value: String(a.views) },
    { label: m.metricStarts, value: String(a.starts) },
    { label: m.metricSubmissions, value: String(a.submissions) },
    {
      label: m.metricCompletionRate,
      // null = no starts in range, so the rate has no denominator.
      value: a.completionRate == null ? '' : `${a.completionRate}%`,
    },
    {
      label: 'Median time to complete',
      // null = no completed session in range had a derivable open time. Showing
      // "0s" there would state a duration nobody measured.
      value: (a.medianTimeToComplete ?? a.timeToComplete) == null ? '—' : formatDuration((a.medianTimeToComplete ?? a.timeToComplete)!, m.seconds),
    },
    {
      label: 'Average time to complete',
      value: a.avgTimeToComplete == null ? '—' : formatDuration(a.avgTimeToComplete, m.seconds),
    },
    { label: m.metricPartials, value: String(a.partialSubmits) },
    // Only when the form actually converts through a meeting: an eternal "0"
    // on every plain form would read as a broken metric, not an absent feature.
    ...(a.bookings > 0 ? [{ label: m.metricBookings, value: String(a.bookings) }] : []),
  ];

  const maxViews = Math.max(1, ...a.dropoff.map((r) => r.views));
  const reached = a.dropoffMode === 'answered' ? m.colAnswered : m.colViews;

  return (
    <div className="flex flex-col gap-6">
      {/* One bordered band, a cell per figure: they read as a row of one object.
          The grid overhangs its frame by a pixel on the right and the bottom, so
          the last cell of each row and the last row carry no doubled rule. */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <dl
          className={`-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 ${
            cards.length >= 7 ? 'xl:grid-cols-7' : 'xl:grid-cols-6'
          }`}
        >
          {cards.map((c) => (
            <div key={c.label} className="flex flex-col justify-between gap-2 border-b border-r border-border p-5">
              <dt className="text-2xs font-medium uppercase tracking-wider text-faint">{c.label}</dt>
              <dd className="text-2xl font-bold tabular-nums tracking-tight">{c.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* The chart over the drop-off list, each the full width: the trend is
          read first, then where people leave. Both are drawn in the signal
          green, the colour progress carries everywhere else in the app. */}
      <div className="flex flex-col gap-6">
        <TrendsChart
          points={a.trends}
          locale={locale}
          labels={{
            title: m.trendsTitle,
            subtitle: m.trendsSubtitle,
            metricLabel: m.trendsMetricLabel,
            empty: m.trendsEmpty,
            seconds: m.seconds,
            // Which zone the days are cut in; the API echoes the one it used.
            note: t(m.timezoneNote, { zone: a.range.timeZone ?? 'UTC' }),
            metrics: {
              views: m.metricViews,
              starts: m.metricStarts,
              submissions: m.metricSubmissions,
              completionRate: m.metricCompletionRate,
              timeToComplete: m.metricTimeToComplete,
            },
          }}
        />

        <section
          className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6"
          data-testid="analytics-dropoff"
        >
          <h2 className="text-base font-semibold">{m.dropoffTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {a.dropoffMode === 'answered' ? m.dropoffSubtitleAnswered : m.dropoffSubtitle}
          </p>
          <ol className="mt-3 flex flex-col">
            {a.dropoff.map((row) => {
              const label = row.isCover ? (row.question ? m.coverRow : m.landingRow) : row.question;
              return (
                <li key={row.stepIndex} className="border-t border-border py-3 first:border-t-0 last:pb-0">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium" title={label}>
                      {!row.isCover ? (
                        <span className="mr-1.5 tabular-nums text-faint">{row.stepIndex + 1}</span>
                      ) : null}
                      {label}
                      {row.key && (
                        <span className="ml-2 font-mono text-xs text-muted-foreground">({row.key})</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
                      <span title={m.colDropoff} className="text-xs">
                        {row.dropoff > 0 ? (
                          <span className="text-destructive">
                            −{row.dropoff}{' '}
                            <span className="text-muted-foreground">({row.dropoffPercent}%)</span>
                          </span>
                        ) : (
                          <span className="text-faint">0</span>
                        )}
                      </span>
                      <span className="min-w-8 text-right font-medium" title={reached}>
                        {row.views}
                      </span>
                    </span>
                  </div>
                  <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-signal-edge"
                      style={{ width: `${Math.round((row.views / maxViews) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* First-Party Traffic Attribution */}
        <section
          className="min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6"
          data-testid="analytics-traffic"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">Traffic Attribution</h2>
              <p className="text-sm text-muted-foreground">
                First-party conversion tracking by UTM source, medium, campaign, and referrers.
              </p>
            </div>
          </div>

          {a.trafficSources && a.trafficSources.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-faint">
                    <th className="pb-3 font-medium">Source</th>
                    <th className="pb-3 font-medium">Medium</th>
                    <th className="pb-3 font-medium">Campaign</th>
                    <th className="pb-3 font-medium text-right">Starts</th>
                    <th className="pb-3 font-medium text-right">Completed</th>
                    <th className="pb-3 font-medium text-right">Conversion Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {a.trafficSources.map((s, idx) => (
                    <tr key={`${s.source}-${s.medium}-${s.campaign}-${idx}`} className="hover:bg-muted/30">
                      <td className="py-3 font-medium text-foreground">{s.source}</td>
                      <td className="py-3 text-muted-foreground">{s.medium || '—'}</td>
                      <td className="py-3 text-muted-foreground">{s.campaign || '—'}</td>
                      <td className="py-3 text-right tabular-nums">{s.total}</td>
                      <td className="py-3 text-right tabular-nums font-semibold">{s.completed}</td>
                      <td className="py-3 text-right tabular-nums">
                        {s.conversionRate != null ? `${s.conversionRate}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No attributed visits recorded yet. Tag your form links with UTM parameters (e.g. <code className="text-xs">?utm_source=twitter&utm_medium=social</code>) to track traffic sources.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-80 w-full rounded-2xl" />
      <Skeleton className="h-80 w-full rounded-2xl" />
    </div>
  );
}
