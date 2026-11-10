/**
 * The public form's server side: what the respondent's browser calls to submit
 * answers, record funnel events, report a booking and authorize an upload.
 *
 * Runs directly in-process via submissionService (Next.js serverless architecture)
 * with graceful fallback to HTTP if an external API_URL is provided.
 */
import { postUploadPresign } from '@/lib/api';
import { postBookingCallback } from '@/lib/booking-embed';
import { forwardedForChain } from '@/lib/forwarded-for';
import type { BookingCallbackInput, UploadPresignInput } from '@quill/types';
import { EVENTS_PER_CALL } from '@/app/[accountCode]/[handle]/[slug]/event-batches';
import { submissionService } from '@/server/services/submission.service';
import { outboxService } from '@/server/services/outbox.service';

/** The four calls the public form makes, by the last segment of the route. */
export const PUBLIC_FORM_OPS = ['submissions', 'events', 'booking', 'uploads'] as const;
export type PublicFormOp = (typeof PUBLIC_FORM_OPS)[number];

export const isPublicFormOp = (op: string): op is PublicFormOp =>
  (PUBLIC_FORM_OPS as readonly string[]).includes(op);

export const MAX_PUBLIC_FORM_BODY_BYTES = 1_000_000;

export interface RelayResult {
  status: number;
  body: Record<string, unknown>;
}

type JsonObject = Record<string, unknown>;

const verdict = (body: JsonObject): RelayResult => ({ status: 200, body });

interface EventInput {
  type?: unknown;
  stepIndex?: unknown;
  stepKey?: unknown;
}

function eventFor(sessionId: unknown, event: EventInput) {
  return {
    sessionId: sessionId as string,
    type: event.type as string,
    stepIndex: (event.stepIndex as number | null | undefined) ?? null,
    stepKey: (event.stepKey as string | null | undefined) ?? null,
  };
}

/**
 * Run one public form call against the Next.js serverless service layer.
 */
export async function relayPublicFormCall(
  op: PublicFormOp,
  accountCode: string,
  slug: string,
  body: JsonObject,
): Promise<RelayResult> {
  switch (op) {
    case 'submissions': {
      const res = await submissionService.submit(accountCode, slug, body);

      // Trigger background outbox draining
      try {
        const { after } = await import('next/server');
        if (typeof after === 'function') {
          after(async () => {
            await outboxService.drainOnce(10);
          });
        } else {
          void outboxService.drainOnce(10);
        }
      } catch {
        void outboxService.drainOnce(10);
      }

      return verdict({
        ok: res.ok,
        score: res.score,
        outcome: res.outcome as any,
        message: res.error ? 'Could not submit.' : undefined,
        error: res.error,
      });
    }
    case 'events': {
      if (Array.isArray(body.events)) {
        await Promise.all(
          (body.events as EventInput[])
            .slice(0, EVENTS_PER_CALL)
            .map((event) =>
              submissionService.event(accountCode, slug, eventFor(body.sessionId, event ?? {})),
            ),
        );
      } else if (!('events' in body)) {
        await submissionService.event(accountCode, slug, eventFor(body.sessionId, body));
      }
      return verdict({ ok: true });
    }
    case 'booking': {
      await postBookingCallback(
        accountCode,
        slug,
        body as BookingCallbackInput,
        await forwardedForChain(),
      );
      return verdict({ ok: true });
    }
    case 'uploads': {
      const res = await postUploadPresign(accountCode, slug, body as UploadPresignInput);
      return verdict(res as unknown as JsonObject);
    }
  }
}
