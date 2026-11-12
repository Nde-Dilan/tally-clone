/**
 * SqlDataStore — implements DataStore on top of @quill/db.
 * Powers local development (SQLite) and self-hosted PostgreSQL.
 */
import {
  createDb,
  sql,
  getAccountByCode,
  listMembers,
  createForm,
  getFormById,
  updateForm,
  deleteForm,
  duplicateForm,
  publishForm,
  getPublishedForm,
  upsertSubmission,
  recordFormEvent,
  uniqueViewCount,
  startCount,
  stepViewCounts,
  completedSubmissions,
  querySubmissions,
  enqueueOutbox,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  setFormFolder,
  deleteSubmissionForAccount,
  deleteSubmissionsForAccount,
  type Db,
} from '@quill/db';
import type {
  AccountEntity,
  DataStore,
  FolderEntity,
  FormEntity,
  MemberEntity,
  OutboxEntity,
  SaveSubmissionInput,
  SaveSubmissionResult,
  ListSubmissionsOptions,
  AnalyticsSummary,
  FormEventEntity,
  SubmissionEntity,
} from './types';
import type { FormConfig } from '@quill/engine';
import type { SubmissionsPage, AnalyticsResponse } from '@quill/types';
import { computeSqlAnalytics } from '../services/analytics-computation';

let dbInstance: Db | null = null;

export async function getSqlDb(): Promise<Db> {
  if (!dbInstance) {
    dbInstance = await createDb();
  }
  return dbInstance;
}

export class SqlDataStore implements DataStore {
  readonly dialect: 'sqlite' | 'postgres' = 'sqlite';

  private async db(): Promise<Db> {
    return getSqlDb();
  }

  async getAccountByCode(code: string): Promise<AccountEntity | null> {
    const db = await this.db();
    const row = await getAccountByCode(db, code);
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      vanitySlug: row.vanity_slug ?? null,
      externalId: row.external_id ?? null,
      createdAt: 0,
    };
  }

  async getAccountById(id: string): Promise<AccountEntity | null> {
    const db = await this.db();
    const row = await db.get<{
      id: string;
      code: string;
      name: string;
      vanity_slug: string | null;
      external_id: string | null;
      created_at: number;
      timezone: string | null;
    }>(
      sql`SELECT id, code, name, vanity_slug, external_id, created_at, timezone
          FROM account WHERE id = ${id} LIMIT 1`,
    );
    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      vanitySlug: row.vanity_slug ?? null,
      externalId: row.external_id ?? null,
      timezone: row.timezone ?? null,
      createdAt: row.created_at ?? 0,
    };
  }

  async getMemberByEmail(email: string): Promise<MemberEntity | null> {
    const db = await this.db();
    const row = await db.get<{
      id: string;
      account_id: string;
      email: string;
      display_name: string | null;
      role: 'owner' | 'admin' | 'member';
      status: 'active' | 'invited' | 'disabled';
      created_at: number;
    }>(
      sql`SELECT id, account_id, email, display_name, role, status, created_at
          FROM member WHERE lower(email) = lower(${email})
          ORDER BY created_at ASC LIMIT 1`,
    );
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.account_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async getAccountMember(accountId: string, memberId: string): Promise<MemberEntity | null> {
    const db = await this.db();
    const row = await db.get<{
      id: string;
      account_id: string;
      email: string;
      display_name: string | null;
      role: 'owner' | 'admin' | 'member';
      status: 'active' | 'invited' | 'disabled';
      created_at: number;
    }>(
      sql`SELECT id, account_id, email, display_name, role, status, created_at
          FROM member WHERE account_id = ${accountId} AND id = ${memberId} LIMIT 1`,
    );
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.account_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }

  async listAccountMembers(accountId: string): Promise<MemberEntity[]> {
    const db = await this.db();
    const rows = await listMembers(db, accountId);
    return rows.map((r) => ({
      id: r.id,
      accountId,
      email: r.email,
      displayName: r.displayName,
      role: r.role,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  async ensureAccountAndMember(email: string): Promise<{ account: AccountEntity; member: MemberEntity }> {
    const existingMember = await this.getMemberByEmail(email);
    if (existingMember) {
      const account = await this.getAccountById(existingMember.accountId);
      if (account) return { account, member: existingMember };
    }

    const db = await this.db();
    const cleanPrefix = email.split('@')[0]?.replace(/[^a-z0-9]+/g, '-').slice(0, 16) || 'org';
    const accountCode = `${cleanPrefix}-${Date.now().toString(36)}`;
    const accountId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const now = Date.now();

    await db.run(
      sql`INSERT INTO account (id, code, name, external_id, created_at)
          VALUES (${accountId}, ${accountCode}, ${cleanPrefix}, ${'dev:' + email.toLowerCase()}, ${now})`,
    );

    await db.run(
      sql`INSERT INTO member (id, account_id, email, role, status, created_at)
          VALUES (${memberId}, ${accountId}, ${email.toLowerCase()}, 'owner', 'active', ${now})`,
    );

    return {
      account: {
        id: accountId,
        code: accountCode,
        name: cleanPrefix,
        vanitySlug: null,
        externalId: 'dev:' + email.toLowerCase(),
        createdAt: now,
      },
      member: {
        id: memberId,
        accountId,
        email: email.toLowerCase(),
        displayName: cleanPrefix,
        role: 'owner',
        status: 'active',
        createdAt: now,
      },
    };
  }

  async getPublishedForm(accountCode: string, slug: string): Promise<FormEntity | null> {
    const db = await this.db();
    const row = await getPublishedForm(db, accountCode, slug);
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.accountId,
      name: row.name,
      slug: row.slug,
      config: (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) as FormConfig,
      draftConfig: null,
      folderId: null,
      createdAt: 0,
      updatedAt: 0,
    };
  }

  async getFormById(accountId: string, formId: string): Promise<FormEntity | null> {
    const db = await this.db();
    const row = await getFormById(db, accountId, formId);
    if (!row) return null;
    return {
      id: row.id,
      accountId: row.accountId,
      name: row.name,
      slug: row.slug,
      config: (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) as FormConfig,
      draftConfig: row.draftConfig ? (typeof row.draftConfig === 'string' ? JSON.parse(row.draftConfig) : row.draftConfig) : null,
      folderId: row.folderId ?? null,
      createdAt: row.createdAt ?? 0,
      updatedAt: row.updatedAt ?? 0,
    };
  }

  async listForms(accountId: string): Promise<FormEntity[]> {
    const db = await this.db();
    const rows = await db.all<Record<string, unknown>>(
      sql`SELECT id, account_id, name, slug, config, draft_config, folder_id, created_at, updated_at
          FROM form WHERE account_id = ${accountId} ORDER BY updated_at DESC, created_at DESC`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      accountId: r.account_id,
      name: r.name,
      slug: r.slug,
      config: (typeof r.config === 'string' ? JSON.parse(r.config) : r.config) as FormConfig,
      draftConfig: r.draft_config ? (typeof r.draft_config === 'string' ? JSON.parse(r.draft_config) : r.draft_config) : null,
      folderId: r.folder_id ?? null,
      createdAt: r.created_at ?? 0,
      updatedAt: r.updated_at ?? 0,
    }));
  }

  async createForm(
    accountId: string,
    data: { name: string; slug?: string; config: FormConfig },
  ): Promise<FormEntity> {
    const db = await this.db();
    const res = await createForm(db, accountId, { name: data.name, slug: data.slug, config: data.config });
    if (!res.ok) throw new Error(`Create form failed: ${res.reason}`);
    const created = res.value;
    return {
      id: created.id,
      accountId: created.accountId,
      name: created.name,
      slug: created.slug,
      config: (typeof created.config === 'string' ? JSON.parse(created.config) : created.config) as FormConfig,
      draftConfig: null,
      folderId: null,
      createdAt: created.createdAt ?? Date.now(),
      updatedAt: created.updatedAt ?? Date.now(),
    };
  }

  async updateForm(accountId: string, formId: string, patch: Partial<FormEntity>): Promise<FormEntity> {
    const db = await this.db();
    const res = await updateForm(db, accountId, formId, {
      name: patch.name,
      config: patch.config,
    });
    if (!res.ok) throw new Error(`Update form failed: ${res.reason}`);
    const r = res.value;
    return {
      id: r.id,
      accountId: r.accountId,
      name: r.name,
      slug: r.slug,
      config: (typeof r.config === 'string' ? JSON.parse(r.config) : r.config) as FormConfig,
      draftConfig: r.draftConfig ? (typeof r.draftConfig === 'string' ? JSON.parse(r.draftConfig) : r.draftConfig) : null,
      folderId: r.folderId ?? null,
      createdAt: r.createdAt ?? 0,
      updatedAt: r.updatedAt ?? 0,
    };
  }

  async deleteForm(accountId: string, formId: string): Promise<boolean> {
    const db = await this.db();
    await deleteForm(db, accountId, formId);
    return true;
  }

  async duplicateForm(accountId: string, formId: string): Promise<FormEntity> {
    const db = await this.db();
    const res = await duplicateForm(db, accountId, formId);
    if (!res.ok) throw new Error(`Duplicate form failed: ${res.reason}`);
    const r = res.value;
    return {
      id: r.id,
      accountId: r.accountId,
      name: r.name,
      slug: r.slug,
      config: (typeof r.config === 'string' ? JSON.parse(r.config) : r.config) as FormConfig,
      draftConfig: null,
      folderId: r.folderId ?? null,
      createdAt: r.createdAt ?? 0,
      updatedAt: r.updatedAt ?? 0,
    };
  }

  async publishForm(accountId: string, formId: string): Promise<{ form: FormEntity; published: boolean }> {
    const db = await this.db();
    const res = await publishForm(db, accountId, formId);
    if (!res.ok) throw new Error(`Publish form failed: ${res.reason}`);
    const r = res.value;
    return {
      form: {
        id: r.id,
        accountId: r.accountId,
        name: r.name,
        slug: r.slug,
        config: (typeof r.config === 'string' ? JSON.parse(r.config) : r.config) as FormConfig,
        draftConfig: null,
        folderId: r.folderId ?? null,
        createdAt: r.createdAt ?? 0,
        updatedAt: r.updatedAt ?? 0,
      },
      published: res.published,
    };
  }

  async saveSubmission(input: SaveSubmissionInput): Promise<SaveSubmissionResult> {
    const db = await this.db();
    const res = await upsertSubmission(db, {
      formId: input.formId,
      sessionId: input.sessionId,
      data: input.data,
      score: input.score ?? 0,
      partial: input.partial,
      visit: input.visit as any,
    });
    return {
      id: res.id,
      isNew: !res.wasCompletedBefore,
      wasCompletedBefore: res.wasCompletedBefore,
    };
  }

  async listSubmissions(
    _accountId: string,
    formId: string,
    opts: ListSubmissionsOptions = {},
  ): Promise<SubmissionsPage> {
    const db = await this.db();
    const res = await querySubmissions(db, formId, {
      limit: opts.limit ?? 25,
      offset: opts.offset ?? 0,
      sort: opts.sort === 'asc' ? 'oldest' : 'newest',
      status: opts.partial ? 'all' : 'completed',
    });
    return res as unknown as SubmissionsPage;
  }

  async getSubmission(
    _accountId: string,
    formId: string,
    submissionId: string,
  ): Promise<SubmissionEntity | null> {
    const db = await this.db();
    const row = await db.get<Record<string, unknown>>(
      sql`SELECT id, form_id, session_id, data, score, partial, visit, created_at, updated_at
          FROM submission WHERE id = ${submissionId} AND form_id = ${formId} LIMIT 1`,
    );
    if (!row) return null;
    return {
      id: String(row.id),
      formId: String(row.form_id),
      sessionId: String(row.session_id),
      data: typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as any),
      score: Number(row.score ?? 0),
      partial: Boolean(row.partial),
      visit: typeof row.visit === 'string' ? JSON.parse(row.visit) : (row.visit as any),
      createdAt: Number(row.created_at ?? 0),
      updatedAt: Number(row.updated_at ?? 0),
    };
  }

  async deleteSubmission(accountId: string, submissionId: string): Promise<boolean> {
    const db = await this.db();
    const res = await deleteSubmissionForAccount(db, accountId, submissionId);
    return res === 'deleted' || res === 'absent';
  }

  async deleteSubmissions(accountId: string, formId: string, ids: string[]): Promise<number> {
    const db = await this.db();
    const res = await deleteSubmissionsForAccount(db, accountId, formId, ids);
    return res.deleted;
  }

  async listFolders(accountId: string): Promise<FolderEntity[]> {
    const db = await this.db();
    const rows = await listFolders(db, accountId);
    return rows.map((r: any) => ({
      id: r.id,
      accountId: r.accountId,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createFolder(accountId: string, name: string): Promise<FolderEntity> {
    const db = await this.db();
    const res = await createFolder(db, accountId, name);
    if (!res.ok) throw new Error(`Create folder failed: ${res.reason}`);
    const r = res.value;
    return {
      id: r.id,
      accountId: r.accountId,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async renameFolder(accountId: string, folderId: string, name: string): Promise<FolderEntity> {
    const db = await this.db();
    const res = await renameFolder(db, accountId, folderId, name);
    if (!res.ok) throw new Error(`Rename folder failed: ${res.reason}`);
    const r = res.value;
    return {
      id: r.id,
      accountId: r.accountId,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async deleteFolder(accountId: string, folderId: string): Promise<boolean> {
    const db = await this.db();
    await deleteFolder(db, accountId, folderId);
    return true;
  }

  async setFormFolder(accountId: string, formId: string, folderId: string | null): Promise<FormEntity> {
    const db = await this.db();
    const res = await setFormFolder(db, accountId, formId, folderId);
    if (!res.ok) throw new Error(`Set form folder failed: ${res.reason}`);
    const form = await this.getFormById(accountId, formId);
    if (!form) throw new Error('Form not found');
    return form;
  }

  async recordFormEvent(event: Omit<FormEventEntity, 'id' | 'createdAt'>): Promise<void> {
    const db = await this.db();
    await recordFormEvent(db, {
      formId: event.formId,
      sessionId: event.sessionId,
      type: event.type as any,
      stepIndex: event.stepIndex ?? undefined,
      stepKey: event.stepKey ?? undefined,
    });
  }

  async getAnalytics(
    accountId: string,
    formId: string,
    range?: { from?: number; to?: number; tz?: string },
  ): Promise<AnalyticsResponse> {
    const db = await this.db();
    const form = await this.getFormById(accountId, formId);
    const config = (form?.config ?? { version: 1, steps: [] }) as FormConfig;
    return computeSqlAnalytics(
      db,
      formId,
      config,
      { from: range?.from, to: range?.to },
      range?.tz,
    );
  }

  async enqueueOutbox(
    item: Omit<OutboxEntity, 'id' | 'status' | 'attempts' | 'nextAttemptAt' | 'createdAt'>,
  ): Promise<string> {
    const db = await this.db();
    return enqueueOutbox(db, {
      kind: item.kind,
      action: item.kind,
      accountId: item.accountId ?? undefined,
      subjectUid: item.subjectUid ?? undefined,
      payload: JSON.stringify(item.payload),
      maxAttempts: item.maxAttempts ?? 5,
    });
  }

  async claimDueOutbox(limit = 10): Promise<OutboxEntity[]> {
    const db = await this.db();
    const now = Date.now();
    const rows = await db.all<Record<string, unknown>>(
      sql`SELECT id, kind, account_id, subject_uid, payload, status, attempts, max_attempts, next_attempt_at, last_error, created_at
          FROM outbox WHERE status = 'pending' AND next_attempt_at <= ${now} LIMIT ${limit}`,
    );
    return rows.map((r: any) => ({
      id: r.id,
      kind: r.kind as any,
      accountId: r.account_id,
      subjectUid: r.subject_uid,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
      status: r.status as any,
      attempts: r.attempts,
      maxAttempts: r.max_attempts,
      nextAttemptAt: r.next_attempt_at,
      lastError: r.last_error,
      createdAt: r.created_at,
    }));
  }

  async markOutboxDone(id: string, _detail?: unknown): Promise<void> {
    const db = await this.db();
    await db.run(sql`UPDATE outbox SET status = 'done', updated_at = ${Date.now()} WHERE id = ${id}`);
  }

  async markOutboxFailed(id: string, error: string): Promise<void> {
    const db = await this.db();
    await db.run(
      sql`UPDATE outbox SET status = 'failed', last_error = ${error.slice(0, 500)}, updated_at = ${Date.now()} WHERE id = ${id}`,
    );
  }
}
