/**
 * DataStore interface — defines the unified storage contract for forms,
 * accounts, submissions, analytics, and outbox events.
 *
 * Implemented by:
 * - SqlDataStore: SQLite (dev/test) & PostgreSQL via @quill/db
 * - FirestoreDataStore: Firebase Firestore NoSQL for cloud serverless deployment
 */
import type { FormConfig } from '@quill/engine';
import type { SubmissionsPage, SubmissionVisit, AnalyticsResponse } from '@quill/types';

export interface AccountEntity {
  id: string;
  code: string;
  name: string;
  vanitySlug: string | null;
  externalId: string | null;
  timezone?: string | null;
  createdAt: number;
}

export interface MemberEntity {
  id: string;
  accountId: string;
  email: string | null;
  displayName: string | null;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'invited' | 'disabled';
  createdAt: number;
}

export interface FormEntity {
  id: string;
  accountId: string;
  name: string;
  slug: string;
  config: FormConfig;
  draftConfig?: FormConfig | null;
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SubmissionEntity {
  id: string;
  formId: string;
  sessionId: string;
  data: Record<string, unknown>;
  score: number | null;
  partial: boolean;
  visit?: SubmissionVisit | null;
  createdAt: number;
  updatedAt: number;
}

export interface FormEventEntity {
  id: string;
  formId: string;
  sessionId: string;
  type: string;
  stepIndex?: number | null;
  stepKey?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: number;
}

export interface FolderEntity {
  id: string;
  accountId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface OutboxEntity {
  id: string;
  kind: 'email' | 'webhook' | 'hubspot' | 'booking_sync' | 'analytics' | 'dapta_sync';
  accountId?: string | null;
  subjectUid?: string | null;
  payload: Record<string, unknown>;
  status: 'pending' | 'done' | 'failed' | 'skipped';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: number;
  lastError?: string | null;
  createdAt: number;
}

export interface AnalyticsSummary {
  views: number;
  starts: number;
  submissions: number;
  completionRate: number;
  averageTimeSeconds: number;
  dropoffsByStep: Array<{ stepKey: string; dropoffs: number }>;
}

export interface SaveSubmissionInput {
  formId: string;
  sessionId: string;
  data: Record<string, unknown>;
  score: number | null;
  partial: boolean;
  visit?: SubmissionVisit | null;
}

export interface SaveSubmissionResult {
  id: string;
  isNew: boolean;
  wasCompletedBefore: boolean;
}

export interface ListSubmissionsOptions {
  limit?: number;
  offset?: number;
  sort?: 'desc' | 'asc';
  partial?: boolean;
}

export interface DataStore {
  readonly dialect: 'sqlite' | 'postgres' | 'firestore';

  // Accounts & Members
  getAccountByCode(code: string): Promise<AccountEntity | null>;
  getAccountById(id: string): Promise<AccountEntity | null>;
  getMemberByEmail(email: string): Promise<MemberEntity | null>;
  getAccountMember(accountId: string, memberId: string): Promise<MemberEntity | null>;
  listAccountMembers(accountId: string): Promise<MemberEntity[]>;
  ensureAccountAndMember(email: string): Promise<{ account: AccountEntity; member: MemberEntity }>;

  // Forms
  getPublishedForm(accountCode: string, slug: string): Promise<FormEntity | null>;
  getFormById(accountId: string, formId: string): Promise<FormEntity | null>;
  listForms(accountId: string): Promise<FormEntity[]>;
  createForm(accountId: string, data: { name: string; slug?: string; config: FormConfig }): Promise<FormEntity>;
  updateForm(accountId: string, formId: string, patch: Partial<FormEntity>): Promise<FormEntity>;
  deleteForm(accountId: string, formId: string): Promise<boolean>;
  duplicateForm(accountId: string, formId: string): Promise<FormEntity>;
  publishForm(accountId: string, formId: string): Promise<{ form: FormEntity; published: boolean }>;

  // Submissions & Events
  saveSubmission(input: SaveSubmissionInput): Promise<SaveSubmissionResult>;
  listSubmissions(accountId: string, formId: string, opts?: ListSubmissionsOptions): Promise<SubmissionsPage>;
  getSubmission(accountId: string, formId: string, submissionId: string): Promise<SubmissionEntity | null>;
  deleteSubmission(accountId: string, submissionId: string): Promise<boolean>;
  deleteSubmissions(accountId: string, formId: string, ids: string[]): Promise<number>;
  recordFormEvent(event: Omit<FormEventEntity, 'id' | 'createdAt'>): Promise<void>;
  getAnalytics(
    accountId: string,
    formId: string,
    range?: { from?: number; to?: number; tz?: string },
  ): Promise<AnalyticsResponse>;

  // Folders
  listFolders(accountId: string): Promise<FolderEntity[]>;
  createFolder(accountId: string, name: string): Promise<FolderEntity>;
  renameFolder(accountId: string, folderId: string, name: string): Promise<FolderEntity>;
  deleteFolder(accountId: string, folderId: string): Promise<boolean>;
  setFormFolder(accountId: string, formId: string, folderId: string | null): Promise<FormEntity>;

  // Outbox / Queue
  enqueueOutbox(item: Omit<OutboxEntity, 'id' | 'status' | 'attempts' | 'nextAttemptAt' | 'createdAt'>): Promise<string>;
  claimDueOutbox(limit?: number): Promise<OutboxEntity[]>;
  markOutboxDone(id: string, detail?: unknown): Promise<void>;
  markOutboxFailed(id: string, error: string): Promise<void>;
}
