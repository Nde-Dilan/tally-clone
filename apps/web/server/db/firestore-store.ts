/**
 * FirestoreDataStore — implements DataStore on top of Firebase Firestore NoSQL.
 * Designed for serverless deployment on Vercel where persistent SQLite is not supported.
 *
 * Configured via environment variables:
 * - FIREBASE_PROJECT_ID
 * - FIREBASE_CLIENT_EMAIL (optional if using ADC or Vercel Firebase Integration)
 * - FIREBASE_PRIVATE_KEY (optional)
 * - FIREBASE_DATABASE_ID (optional, defaults to '(default)')
 */
import type { FormConfig } from '@quill/engine';
import type { SubmissionsPage, AnalyticsResponse } from '@quill/types';
import seedData from './seed-data.json';
import type {
  AccountEntity,
  AnalyticsSummary,
  DataStore,
  FormEntity,
  FormEventEntity,
  ListSubmissionsOptions,
  MemberEntity,
  OutboxEntity,
  SaveSubmissionInput,
  SaveSubmissionResult,
  SubmissionEntity,
} from './types';

export class FirestoreDataStore implements DataStore {
  readonly dialect: 'firestore' = 'firestore';
  private firestore: any = null;

  private async getFirestore(): Promise<any> {
    if (this.firestore) return this.firestore;

    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');

    if (!getApps().length) {
      const projectId = process.env.FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const rawKey = process.env.FIREBASE_PRIVATE_KEY;
      const privateKey = rawKey ? rawKey.replace(/\\n/g, '\n').replace(/^"|"$/g, '') : undefined;

      if (clientEmail && privateKey) {
        initializeApp({
          credential: cert({ projectId, clientEmail, privateKey }),
          projectId,
        });
      } else if (projectId) {
        initializeApp({ projectId });
      }
    }

    this.firestore = getFirestore();
    await this.ensureSeedData(this.firestore);
    return this.firestore;
  }

  private async ensureSeedData(fs: any): Promise<void> {
    try {
      const acmeSnap = await fs.collection('accounts').where('code', '==', 'acme').limit(1).get();
      if (!acmeSnap.empty) return;

      const batch = fs.batch();
      batch.set(fs.collection('accounts').doc(seedData.account.id), seedData.account);
      for (const m of seedData.members) {
        batch.set(fs.collection('members').doc(m.id), m);
      }
      for (const f of seedData.forms) {
        batch.set(fs.collection('forms').doc(f.id), f);
      }
      await batch.commit();
    } catch (err) {
      console.warn('ensureSeedData notice:', err);
    }
  }

  async getAccountByCode(code: string): Promise<AccountEntity | null> {
    const fs = await this.getFirestore();
    const snap = await fs.collection('accounts').where('code', '==', code).limit(1).get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as AccountEntity;
  }

  async getAccountById(id: string): Promise<AccountEntity | null> {
    const fs = await this.getFirestore();
    const doc = await fs.collection('accounts').doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as AccountEntity;
  }

  async getMemberByEmail(email: string): Promise<MemberEntity | null> {
    const fs = await this.getFirestore();
    const snap = await fs
      .collection('members')
      .where('email', '==', email.toLowerCase())
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as MemberEntity;
  }

  async getAccountMember(accountId: string, memberId: string): Promise<MemberEntity | null> {
    const fs = await this.getFirestore();
    const doc = await fs.collection('members').doc(memberId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.accountId !== accountId) return null;
    return { id: doc.id, ...data } as MemberEntity;
  }

  async listAccountMembers(accountId: string): Promise<MemberEntity[]> {
    const fs = await this.getFirestore();
    const snap = await fs.collection('members').where('accountId', '==', accountId).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  }

  async ensureAccountAndMember(email: string): Promise<{ account: AccountEntity; member: MemberEntity }> {
    const existing = await this.getMemberByEmail(email);
    if (existing) {
      const acc = await this.getAccountById(existing.accountId);
      if (acc) return { account: acc, member: existing };
    }

    const fs = await this.getFirestore();
    const now = Date.now();
    const cleanPrefix = email.split('@')[0]?.replace(/[^a-z0-9]+/g, '-').slice(0, 16) || 'org';
    const accountCode = `${cleanPrefix}-${now.toString(36)}`;
    const accountId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    const account: AccountEntity = {
      id: accountId,
      code: accountCode,
      name: cleanPrefix,
      vanitySlug: null,
      externalId: `dev:${email.toLowerCase()}`,
      createdAt: now,
    };

    const member: MemberEntity = {
      id: memberId,
      accountId,
      email: email.toLowerCase(),
      displayName: cleanPrefix,
      role: 'owner',
      status: 'active',
      createdAt: now,
    };

    const batch = fs.batch();
    batch.set(fs.collection('accounts').doc(accountId), account);
    batch.set(fs.collection('members').doc(memberId), member);
    await batch.commit();

    return { account, member };
  }

  async getPublishedForm(accountCode: string, slug: string): Promise<FormEntity | null> {
    const account = await this.getAccountByCode(accountCode);
    if (!account) return null;

    const fs = await this.getFirestore();
    const snap = await fs
      .collection('forms')
      .where('accountId', '==', account.id)
      .where('slug', '==', slug)
      .limit(1)
      .get();
    if (snap.empty) return null;
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() } as FormEntity;
  }

  async getFormById(accountId: string, formId: string): Promise<FormEntity | null> {
    const fs = await this.getFirestore();
    const doc = await fs.collection('forms').doc(formId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.accountId !== accountId) return null;
    return { id: doc.id, ...data } as FormEntity;
  }

  async listForms(accountId: string): Promise<FormEntity[]> {
    const fs = await this.getFirestore();
    const snap = await fs.collection('forms').where('accountId', '==', accountId).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  }

  async createForm(
    accountId: string,
    data: { name: string; slug?: string; config: FormConfig },
  ): Promise<FormEntity> {
    const fs = await this.getFirestore();
    const id = crypto.randomUUID();
    const now = Date.now();
    const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32);

    const form: FormEntity = {
      id,
      accountId,
      name: data.name,
      slug,
      config: data.config,
      draftConfig: null,
      folderId: null,
      createdAt: now,
      updatedAt: now,
    };

    await fs.collection('forms').doc(id).set(form);
    return form;
  }

  async updateForm(accountId: string, formId: string, patch: Partial<FormEntity>): Promise<FormEntity> {
    const existing = await this.getFormById(accountId, formId);
    if (!existing) throw new Error('Form not found.');

    const fs = await this.getFirestore();
    const updatedAt = Date.now();
    const updated = { ...existing, ...patch, updatedAt };
    await fs.collection('forms').doc(formId).update(updated);
    return updated;
  }

  async deleteForm(accountId: string, formId: string): Promise<boolean> {
    const existing = await this.getFormById(accountId, formId);
    if (!existing) return false;

    const fs = await this.getFirestore();
    await fs.collection('forms').doc(formId).delete();
    return true;
  }

  async duplicateForm(accountId: string, formId: string): Promise<FormEntity> {
    const existing = await this.getFormById(accountId, formId);
    if (!existing) throw new Error('Form not found.');

    const copyName = `${existing.name} (Copy)`;
    const copySlug = `${existing.slug}-copy-${Date.now().toString(36).slice(-4)}`;
    return this.createForm(accountId, {
      name: copyName,
      slug: copySlug,
      config: existing.config,
    });
  }

  async publishForm(accountId: string, formId: string): Promise<{ form: FormEntity; published: boolean }> {
    const existing = await this.getFormById(accountId, formId);
    if (!existing) throw new Error('Form not found.');

    if (existing.draftConfig) {
      const updated = await this.updateForm(accountId, formId, {
        config: existing.draftConfig,
        draftConfig: null,
      });
      return { form: updated, published: true };
    }
    return { form: existing, published: false };
  }

  async saveSubmission(input: SaveSubmissionInput): Promise<SaveSubmissionResult> {
    const fs = await this.getFirestore();
    const submissionsCol = fs.collection('submissions');

    const snap = await submissionsCol
      .where('formId', '==', input.formId)
      .where('sessionId', '==', input.sessionId)
      .limit(1)
      .get();

    const now = Date.now();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const prev = doc.data();
      const wasCompletedBefore = !prev.partial;

      await doc.ref.update({
        data: { ...(prev.data || {}), ...input.data },
        score: input.score ?? prev.score,
        partial: input.partial,
        visit: input.visit ?? prev.visit,
        updatedAt: now,
      });

      return {
        id: doc.id,
        isNew: false,
        wasCompletedBefore,
      };
    }

    const id = crypto.randomUUID();
    const newSubmission: SubmissionEntity = {
      id,
      formId: input.formId,
      sessionId: input.sessionId,
      data: input.data,
      score: input.score,
      partial: input.partial,
      visit: input.visit ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await submissionsCol.doc(id).set(newSubmission);
    return {
      id,
      isNew: true,
      wasCompletedBefore: false,
    };
  }

  async listSubmissions(
    _accountId: string,
    formId: string,
    opts: ListSubmissionsOptions = {},
  ): Promise<SubmissionsPage> {
    const fs = await this.getFirestore();
    let query = fs.collection('submissions').where('formId', '==', formId);

    if (!opts.partial) {
      query = query.where('partial', '==', false);
    }

    const limit = opts.limit ?? 25;
    const snap = await query.orderBy('createdAt', opts.sort ?? 'desc').limit(limit).get();
    const items = snap.docs.map((doc: any) => {
      const d = doc.data();
      return {
        id: doc.id,
        formId,
        sessionId: d.sessionId,
        data: d.data as any,
        score: d.score,
        startedAt: d.createdAt,
        completedAt: d.partial ? null : d.updatedAt,
        partialAt: d.partial ? d.updatedAt : null,
        durationSeconds: 0,
        visit: d.visit ?? null,
      };
    });

    return {
      items,
      total: snap.docs.length,
      limit,
      offset: opts.offset ?? 0,
    };
  }

  async recordFormEvent(event: Omit<FormEventEntity, 'id' | 'createdAt'>): Promise<void> {
    const fs = await this.getFirestore();
    const id = crypto.randomUUID();
    const entity: FormEventEntity = {
      id,
      ...event,
      createdAt: Date.now(),
    };
    await fs.collection('form_events').doc(id).set(entity);
  }

  async getAnalytics(
    accountId: string,
    formId: string,
    range?: { from?: number; to?: number; tz?: string },
  ): Promise<AnalyticsResponse> {
    const fs = await this.getFirestore();
    const form = await this.getFormById(accountId, formId);
    const config = (form?.config ?? { version: 1, steps: [] }) as FormConfig;
    const steps = config.steps ?? [];

    const [eventsSnap, submissionsSnap] = await Promise.all([
      fs.collection('form_events').where('formId', '==', formId).get(),
      fs.collection('submissions').where('formId', '==', formId).where('partial', '==', false).get(),
    ]);

    const viewSessions = new Set<string>();
    const startSessions = new Set<string>();
    const stepCounts: Record<string, number> = {};
    const trafficMap = new Map<string, { views: number; submissions: number }>();

    eventsSnap.docs.forEach((doc: any) => {
      const d = doc.data();
      if (d.type === 'view') viewSessions.add(d.sessionId);
      if (d.type === 'start') startSessions.add(d.sessionId);
      if (d.type === 'step_view' && d.stepKey) {
        stepCounts[d.stepKey] = (stepCounts[d.stepKey] || 0) + 1;
      }
    });

    const views = viewSessions.size;
    const starts = startSessions.size;
    const submissions = submissionsSnap.docs.length;
    const completionRate = starts > 0 ? Math.min(100, Math.round((submissions / starts) * 1000) / 10) : null;

    const durations: number[] = [];
    submissionsSnap.docs.forEach((doc: any) => {
      const d = doc.data();
      if (d.createdAt && d.updatedAt && d.updatedAt > d.createdAt) {
        durations.push(d.updatedAt - d.createdAt);
      }
      if (d.visit && d.visit.source) {
        const key = `${d.visit.source}|${d.visit.medium || ''}|${d.visit.campaign || ''}`;
        const cur = trafficMap.get(key) || { views: 1, submissions: 0 };
        cur.submissions += 1;
        trafficMap.set(key, cur);
      }
    });

    const medianTime = durations.length > 0 ? Math.round(durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]! / 1000) : null;
    const avgTime = durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : null;

    const dropoff = [
      {
        stepIndex: -1,
        key: null,
        question: config.cover?.headline || 'Cover',
        isCover: true,
        views,
        dropoff: Math.max(0, views - starts),
        dropoffPercent: views > 0 ? Math.round((Math.max(0, views - starts) / views) * 1000) / 10 : 0,
      },
      ...steps.map((s, i) => {
        const stepViews = stepCounts[s.key] ?? 0;
        const nextViews = i < steps.length - 1 ? (stepCounts[steps[i + 1]!.key] ?? 0) : submissions;
        const drop = Math.max(0, stepViews - nextViews);
        return {
          stepIndex: i,
          key: s.key,
          question: (s as any).question || (s as any).title || s.key,
          isCover: false,
          views: stepViews,
          dropoff: drop,
          dropoffPercent: stepViews > 0 ? Math.round((drop / stepViews) * 1000) / 10 : 0,
        };
      }),
    ];

    const trafficSources = Array.from(trafficMap.entries()).map(([k, v]) => {
      const [source, medium, campaign] = k.split('|');
      return {
        source: source || 'direct',
        medium: medium || null,
        campaign: campaign || null,
        total: v.views,
        completed: v.submissions,
        conversionRate: v.views > 0 ? Math.round((v.submissions / v.views) * 1000) / 10 : null,
      };
    });

    return {
      views,
      starts,
      submissions,
      completionRate,
      timeToComplete: medianTime,
      medianTimeToComplete: medianTime,
      avgTimeToComplete: avgTime,
      partialSubmits: 0,
      bookings: 0,
      dropoffMode: 'answered',
      dropoff,
      trends: [],
      trafficSources,
      range: { from: range?.from ?? null, to: range?.to ?? null, timeZone: range?.tz ?? 'UTC' },
    };
  }

  async enqueueOutbox(
    item: Omit<OutboxEntity, 'id' | 'status' | 'attempts' | 'nextAttemptAt' | 'createdAt'>,
  ): Promise<string> {
    const fs = await this.getFirestore();
    const id = crypto.randomUUID();
    const now = Date.now();
    const outboxItem: OutboxEntity = {
      id,
      ...item,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
    };
    await fs.collection('outbox').doc(id).set(outboxItem);
    return id;
  }

  async claimDueOutbox(limit = 10): Promise<OutboxEntity[]> {
    const fs = await this.getFirestore();
    const now = Date.now();
    const snap = await fs
      .collection('outbox')
      .where('status', '==', 'pending')
      .where('nextAttemptAt', '<=', now)
      .limit(limit)
      .get();

    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  }

  async markOutboxDone(id: string, _detail?: unknown): Promise<void> {
    const fs = await this.getFirestore();
    await fs.collection('outbox').doc(id).update({
      status: 'done',
      completedAt: Date.now(),
    });
  }

  async markOutboxFailed(id: string, error: string): Promise<void> {
    const fs = await this.getFirestore();
    await fs.collection('outbox').doc(id).update({
      status: 'failed',
      lastError: error,
      updatedAt: Date.now(),
    });
  }
}
