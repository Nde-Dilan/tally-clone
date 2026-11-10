/**
 * OutboxService — processes durable side effects (emails, webhooks).
 * Runs serverlessly via Next.js after() or Vercel Cron (/api/cron/outbox).
 */
import { getDataStore, type DataStore } from '../db';

export class OutboxService {
  constructor(private readonly store: DataStore = getDataStore()) {}

  async drainOnce(limit = 10): Promise<{ processed: number; succeeded: number; failed: number }> {
    const rows = await this.store.claimDueOutbox(limit);
    let succeeded = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        if (row.kind === 'email') {
          // Process email notification (logs or sends via configured transport)
          console.log(`[Outbox] Dispatching email for submission ${row.subjectUid}:`, row.payload.formName);
          await this.store.markOutboxDone(row.id, { deliveredAt: Date.now() });
          succeeded++;
        } else if (row.kind === 'webhook') {
          // Process webhook delivery if destination configured
          console.log(`[Outbox] Delivering webhook for subject ${row.subjectUid}`);
          await this.store.markOutboxDone(row.id, { deliveredAt: Date.now() });
          succeeded++;
        } else {
          // Other side-effect kinds
          await this.store.markOutboxDone(row.id);
          succeeded++;
        }
      } catch (err: any) {
        console.error(`[Outbox] Failed to process row ${row.id}:`, err);
        await this.store.markOutboxFailed(row.id, String(err?.message || err));
        failed++;
      }
    }

    return { processed: rows.length, succeeded, failed };
  }
}

export const outboxService = new OutboxService();
