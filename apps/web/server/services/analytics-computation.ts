import type { Db } from '@quill/db';
import {
  uniqueViewCount,
  startCount,
  stepViewCounts,
  stepCompleteCounts,
  partialCount,
  bookingCount,
  completedSubmissions,
  dailyViewSessions,
  dailyStartSessions,
  trafficAttribution,
  DAY_MS,
  firstEventAt,
  type CompletedSubmission,
  type DateRange,
  type DayBucketing,
} from '@quill/db';
import {
  resolveFormLayout,
  stepQuestionText,
} from '@quill/engine';
import { localDayIndex, resolveTimeZone, utcOffsetSegments } from '@quill/shared';
import type { AnalyticsResponse, DropoffRow, FormConfig, TrendPoint } from '@quill/types';

function pct1(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function completionPct(submissions: number, starts: number): number | null {
  if (starts <= 0) return null;
  return Math.min(100, pct1(submissions, starts));
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function medianSeconds(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  return Math.round(median(durationsMs) / 1000);
}

function averageSeconds(durationsMs: number[]): number | null {
  if (durationsMs.length === 0) return null;
  const sum = durationsMs.reduce((a, b) => a + b, 0);
  return Math.round(sum / durationsMs.length / 1000);
}

const MAX_TREND_DAYS = 366;

export function buildTrends(input: {
  range: DateRange;
  zone: string;
  dailyViews: { day: number; n: number }[];
  dailyStarts: { day: number; n: number }[];
  completed: CompletedSubmission[];
}): TrendPoint[] {
  const viewsByDay = new Map(input.dailyViews.map((d) => [d.day, d.n]));
  const startsByDay = new Map(input.dailyStarts.map((d) => [d.day, d.n]));
  const subsByDay = new Map<number, number>();
  const dursByDay = new Map<number, number[]>();
  for (const c of input.completed) {
    subsByDay.set(c.day, (subsByDay.get(c.day) ?? 0) + 1);
    if (c.durationMs != null) {
      const list = dursByDay.get(c.day) ?? [];
      list.push(c.durationMs);
      dursByDay.set(c.day, list);
    }
  }

  const observed = [...viewsByDay.keys(), ...startsByDay.keys(), ...subsByDay.keys()];
  const bounded = input.range.from != null && input.range.to != null;
  if (observed.length === 0 && !bounded) return [];

  const fromDay = input.range.from != null ? localDayIndex(input.range.from, input.zone) : Math.min(...observed);
  const toDay = input.range.to != null ? localDayIndex(input.range.to, input.zone) : Math.max(...observed);
  if (toDay < fromDay) return [];

  const span = Math.min(toDay - fromDay, MAX_TREND_DAYS - 1);
  const out: TrendPoint[] = [];
  for (let i = 0; i <= span; i++) {
    const day = toDay - span + i;
    const starts = startsByDay.get(day) ?? 0;
    const submissions = subsByDay.get(day) ?? 0;
    out.push({
      t: day * DAY_MS,
      views: viewsByDay.get(day) ?? 0,
      starts,
      submissions,
      completionRate: completionPct(submissions, starts),
      timeToComplete: medianSeconds(dursByDay.get(day) ?? []),
    });
  }
  return out;
}

export async function computeSqlAnalytics(
  db: Db,
  formId: string,
  config: FormConfig,
  range: DateRange = {},
  timeZone?: string | null,
): Promise<AnalyticsResponse> {
  const zone = resolveTimeZone(timeZone);
  let bucketing: DayBucketing | undefined;
  if (zone !== 'UTC') {
    const from = range.from ?? (await firstEventAt(db, formId)) ?? Date.now();
    const to = range.to ?? Date.now();
    bucketing = { segments: utcOffsetSegments(from - DAY_MS, to + DAY_MS, zone) };
  }

  const steps = config.steps ?? [];
  const dropoffMode = resolveFormLayout(config) === 'vertical' ? 'answered' : 'viewed';

  const [views, starts, stepViews, partialSubmits, bookings, completed, dailyViews, dailyStarts, trafficSources] =
    await Promise.all([
      uniqueViewCount(db, formId, range),
      startCount(db, formId, range),
      dropoffMode === 'answered'
        ? stepCompleteCounts(db, formId, range)
        : stepViewCounts(db, formId, range),
      partialCount(db, formId, range),
      bookingCount(db, formId, range),
      completedSubmissions(db, formId, range, bucketing),
      dailyViewSessions(db, formId, range, bucketing),
      dailyStartSessions(db, formId, range, bucketing),
      trafficAttribution(db, formId, range),
    ]);

  const submissions = completed.length;
  const durations = completed
    .map((c) => c.durationMs)
    .filter((d): d is number => d != null);
  const completionRate = completionPct(submissions, starts);
  const timeToComplete = medianSeconds(durations);
  const medianTimeToComplete = timeToComplete;
  const avgTimeToComplete = averageSeconds(durations);
  const trends = buildTrends({ range, zone, dailyViews, dailyStarts, completed });

  const rowViews: number[] = [views];
  for (let i = 0; i < steps.length; i++) {
    rowViews.push(stepViews.byKey.get(steps[i]!.key) ?? stepViews.byIndex.get(i) ?? 0);
  }

  const dropoff: DropoffRow[] = [];
  const coverViews = rowViews[0] ?? 0;
  const coverDrop = Math.max(0, coverViews - (rowViews[1] ?? 0));
  dropoff.push({
    stepIndex: -1,
    key: null,
    question:
      config.cover && config.cover.enabled !== false
        ? config.cover.headline?.trim() || config.cover.eyebrow?.trim() || 'Cover'
        : '',
    isCover: true,
    views: coverViews,
    dropoff: coverDrop,
    dropoffPercent: pct1(coverDrop, coverViews),
  });

  for (let i = 0; i < steps.length; i++) {
    const viewsAtStep = rowViews[i + 1] ?? 0;
    const viewsAtNext = i < steps.length - 1 ? (rowViews[i + 2] ?? 0) : submissions;
    const drop = Math.max(0, viewsAtStep - viewsAtNext);
    dropoff.push({
      stepIndex: i,
      key: steps[i]!.key,
      question: stepQuestionText(steps[i]!).trim() || steps[i]!.key,
      isCover: false,
      views: viewsAtStep,
      dropoff: drop,
      dropoffPercent: pct1(drop, viewsAtStep),
    });
  }

  return {
    views,
    starts,
    submissions,
    completionRate,
    timeToComplete,
    medianTimeToComplete,
    avgTimeToComplete,
    partialSubmits,
    bookings,
    dropoffMode,
    dropoff,
    trends,
    trafficSources,
    range: { from: range.from ?? null, to: range.to ?? null, timeZone: zone },
  };
}
