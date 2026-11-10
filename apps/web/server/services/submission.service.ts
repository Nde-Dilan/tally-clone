/**
 * SubmissionService — manages public form fetching, answer validation,
 * score computation, submission persistence, and outbox event enqueueing.
 */
import {
  computeScore,
  hasScoringSignal,
  resolveOutcome,
  respondentFullName,
  summarizeAnswers,
  type FormConfig,
} from '@quill/engine';
import { submissionSchema, type PublicForm, type SubmissionVisit } from '@quill/types';
import { getDataStore, type DataStore } from '../db';

export interface SubmitContext {
  remoteIp?: string | null;
}

function toPublicConfig(config: unknown): FormConfig {
  const c = (config ?? { version: 1, steps: [] }) as Record<string, unknown>;
  const { destinations: _destinations, spamProtection: _spamProtection, ...rest } = c;
  return rest as unknown as FormConfig;
}

function pickEmail(data: Record<string, unknown>): string | null {
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      return val.trim().toLowerCase();
    }
  }
  return null;
}

export class SubmissionService {
  constructor(private readonly store: DataStore = getDataStore()) {}

  async publicForm(accountCode: string, slug: string): Promise<PublicForm | null> {
    const form = await this.store.getPublishedForm(accountCode, slug);
    if (!form) return null;

    return {
      slug: form.slug,
      name: form.name,
      config: toPublicConfig(form.config),
    };
  }

  async submit(
    accountCode: string,
    slug: string,
    body: unknown,
    _ctx: SubmitContext = {},
  ): Promise<{ ok: boolean; submissionId?: string; score?: number; outcome?: unknown; error?: string }> {
    const form = await this.store.getPublishedForm(accountCode, slug);
    if (!form) {
      return { ok: false, error: 'NOT_FOUND' };
    }

    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, error: 'BAD_REQUEST' };
    }

    const input = parsed.data;
    const config = form.config;
    const data = input.data ?? {};
    const partial = Boolean(input.partial);

    // Score & Outcome
    const score = computeScore(config, data);
    const outcome = resolveOutcome(config, score, data);

    const res = await this.store.saveSubmission({
      formId: form.id,
      sessionId: input.sessionId,
      data,
      score,
      partial,
      visit: input.visit as SubmissionVisit | null | undefined,
    });

    // Enqueue outbox side effects if this is a completed submission (and not previously completed)
    if (!partial && !res.wasCompletedBefore) {
      const respondentEmail = pickEmail(data);
      const respondentName = respondentFullName(config.steps, data) || null;
      const answers = summarizeAnswers(config, data);

      await this.store.enqueueOutbox({
        kind: 'email',
        accountId: form.accountId,
        subjectUid: res.id,
        payload: {
          submissionId: res.id,
          formName: form.name,
          respondentEmail,
          respondentName,
          score: hasScoringSignal(config) ? score : null,
          outcomeLabel: outcome?.label ?? null,
          answers,
        },
        maxAttempts: 5,
      });
    }

    return {
      ok: true,
      submissionId: res.id,
      score: score ?? 0,
      outcome,
    };
  }

  async event(
    accountCode: string,
    slug: string,
    body: unknown,
  ): Promise<{ ok: boolean }> {
    const form = await this.store.getPublishedForm(accountCode, slug);
    if (!form) return { ok: false };

    const b = (body ?? {}) as Record<string, unknown>;
    const sessionId = String(b.sessionId || '');
    const type = String(b.type || '');
    if (!sessionId || !type) return { ok: false };

    await this.store.recordFormEvent({
      formId: form.id,
      sessionId,
      type,
      stepIndex: typeof b.stepIndex === 'number' ? b.stepIndex : null,
      stepKey: typeof b.stepKey === 'string' ? b.stepKey : null,
      metadata: typeof b.metadata === 'object' && b.metadata !== null ? (b.metadata as Record<string, unknown>) : null,
    });

    return { ok: true };
  }
}

export const submissionService = new SubmissionService();
