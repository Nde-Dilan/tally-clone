/**
 * AdminService — manages admin operations: workspaces, user info,
 * forms CRUD, duplication, publishing, and submissions.
 */
import {
  isInputlessStep,
  isFilterableChoiceStep,
  summarizeFacets,
  summarizeSubmissions,
  summaryAnswer,
  type FormConfig,
  type FormStep,
  type SubmissionFacets,
  type SubmissionsSummary,
  type SummaryAnswer,
  type SummaryRow,
} from '@quill/engine';
import type {
  AccountMember,
  BrandKit,
  BrandingResponse,
  Folder,
  FormDestination,
  FormNotificationsResponse,
  LinkPageEditorView,
  LinkPagesListView,
  Me,
  NotificationsResponse,
  PendingInvitation,
  SubmissionView,
  Workspace,
} from '@/lib/admin-api';
import { getDataStore, type DataStore } from '../db';
import type { HostPrincipal } from '../auth/host-auth';

export class AdminService {
  constructor(private readonly store: DataStore = getDataStore()) {}

  async me(principal: HostPrincipal): Promise<Me> {
    const account = await this.store.getAccountById(principal.accountId);
    const member = await this.store.getAccountMember(principal.accountId, principal.memberId);

    if (!account || !member) {
      throw new Error('Account or member not found.');
    }

    return {
      accountId: account.id,
      accountName: account.name,
      accountCode: account.code,
      accountShortCode: account.code,
      vanitySlug: account.vanitySlug,
      memberId: member.id,
      handle: member.displayName,
      displayName: member.displayName,
      email: member.email,
      role: member.role,
      status: member.status,
      onboardingRequired: false,
      onboardingCompletedAt: Date.now(),
      attribution: null,
      uploads: { enabled: true, maxFileMb: 10 },
      accessGrant: null,
      staff: false,
      locale: 'en',
      timezone: account.timezone ?? 'UTC',
    };
  }

  async listWorkspaces(principal: HostPrincipal): Promise<Workspace[]> {
    const account = await this.store.getAccountById(principal.accountId);
    const member = await this.store.getAccountMember(principal.accountId, principal.memberId);
    if (!account || !member) return [];

    return [
      {
        accountId: account.id,
        workspaceId: null,
        accountCode: account.code,
        accountName: account.name,
        memberId: member.id,
        role: member.role,
        status: member.status,
        memberCount: 1,
        accessGrant: null,
      },
    ];
  }

  async listForms(accountId: string) {
    const forms = await this.store.listForms(accountId);
    return forms.map((f) => ({
      id: f.id,
      name: f.name,
      slug: f.slug,
      brandAppliedAt: null,
      folderId: f.folderId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
      hasDraft: Boolean(f.draftConfig),
    }));
  }

  async getForm(accountId: string, formId: string) {
    const form = await this.store.getFormById(accountId, formId);
    if (!form) return null;
    return {
      id: form.id,
      accountId: form.accountId,
      name: form.name,
      slug: form.slug,
      config: form.config,
      draftConfig: form.draftConfig,
      createdAt: form.createdAt,
      updatedAt: form.updatedAt,
    };
  }

  async createForm(
    accountId: string,
    data: { name: string; slug?: string; config?: FormConfig; layout?: string },
  ) {
    const initialConfig: FormConfig = data.config ?? {
      version: 1,
      title: data.name,
      layout: (data.layout as any) || 'vertical',
      steps: [],
    };

    return this.store.createForm(accountId, {
      name: data.name,
      slug: data.slug,
      config: initialConfig,
    });
  }

  async updateForm(accountId: string, formId: string, patch: Record<string, unknown>) {
    return this.store.updateForm(accountId, formId, patch as any);
  }

  async publishForm(accountId: string, formId: string) {
    return this.store.publishForm(accountId, formId);
  }

  async duplicateForm(accountId: string, formId: string) {
    return this.store.duplicateForm(accountId, formId);
  }

  async deleteForm(accountId: string, formId: string) {
    return this.store.deleteForm(accountId, formId);
  }

  async listSubmissions(accountId: string, formId: string, opts: Record<string, unknown> = {}) {
    return this.store.listSubmissions(accountId, formId, opts as any);
  }

  async getAnalytics(
    accountId: string,
    formId: string,
    range?: { from?: number; to?: number; tz?: string },
  ) {
    return this.store.getAnalytics(accountId, formId, range);
  }

  async getSubmissionFacets(accountId: string, formId: string): Promise<SubmissionFacets> {
    const form = await this.getForm(accountId, formId);
    const config = (form?.config ?? { version: 1, steps: [] }) as FormConfig;
    const steps = (config.steps ?? []).filter((s) => !isInputlessStep(s));
    const submissions = await this.store.listSubmissions(accountId, formId, { limit: 1000 });

    const total = submissions.total;
    let completed = 0;
    let partial = 0;
    for (const item of submissions.items) {
      if (item.completedAt && !item.partialAt) completed++;
      else partial++;
    }

    const choiceSteps = steps.filter(isFilterableChoiceStep);
    const choiceCounts: Record<string, { answered: number; values: Record<string, number> }> = {};
    for (const s of choiceSteps) {
      const counts: Record<string, number> = {};
      let answered = 0;
      for (const sub of submissions.items) {
        const raw = (sub.data as Record<string, unknown>)?.[s.key];
        const tokens = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
        const valid = [...new Set(tokens.map((v) => String(v).trim()).filter(Boolean))];
        if (valid.length > 0) {
          answered++;
          for (const t of valid) {
            counts[t] = (counts[t] ?? 0) + 1;
          }
        }
      }
      choiceCounts[s.key] = { answered, values: counts };
    }

    return summarizeFacets(steps, {
      total,
      completed,
      partial,
      choices: choiceCounts,
    });
  }

  async getSubmissionsSummary(
    accountId: string,
    formId: string,
    _query: Record<string, unknown> = {},
  ): Promise<SubmissionsSummary> {
    const form = await this.getForm(accountId, formId);
    const config = (form?.config ?? { version: 1, steps: [] }) as FormConfig;
    const steps = (config.steps ?? []).filter((s) => !isInputlessStep(s));
    const submissions = await this.store.listSubmissions(accountId, formId, { limit: 1000 });
    const rows: SummaryRow[] = submissions.items.map((s) => ({
      id: s.id,
      data: s.data as Record<string, unknown>,
      at: s.completedAt ?? s.partialAt ?? s.startedAt,
    }));
    return summarizeSubmissions(steps, rows);
  }

  async searchSummaryAnswers(
    accountId: string,
    formId: string,
    stepKey: string,
    q: { q?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: SummaryAnswer[]; total: number; limit: number; offset: number }> {
    const form = await this.getForm(accountId, formId);
    const config = (form?.config ?? { version: 1, steps: [] }) as FormConfig;
    const steps = (config.steps ?? []).filter((s) => !isInputlessStep(s));
    const step = steps.find((s) => s.key === stepKey);
    const limit = q.limit ?? 25;
    const offset = q.offset ?? 0;
    if (!step) return { items: [], total: 0, limit, offset };

    const submissions = await this.store.listSubmissions(accountId, formId, { limit: 1000 });
    const rows: SummaryRow[] = submissions.items.map((s) => ({
      id: s.id,
      data: s.data as Record<string, unknown>,
      at: s.completedAt ?? s.partialAt ?? s.startedAt,
    }));

    const answers: SummaryAnswer[] = [];
    const needle = (q.q ?? '').trim().toLowerCase();
    for (const row of rows) {
      const ans = summaryAnswer(steps, step, row);
      if (!ans) continue;
      if (needle && !ans.text.toLowerCase().includes(needle)) continue;
      answers.push(ans);
    }

    return {
      items: answers.slice(offset, offset + limit),
      total: answers.length,
      limit,
      offset,
    };
  }

  async getSubmission(
    accountId: string,
    formId: string,
    submissionId: string,
  ): Promise<SubmissionView | null> {
    const sub = await this.store.getSubmission(accountId, formId, submissionId);
    if (!sub) return null;
    return {
      id: sub.id,
      formId: sub.formId,
      sessionId: sub.sessionId,
      data: sub.data as any,
      score: sub.score ?? 0,
      startedAt: sub.createdAt,
      completedAt: sub.partial ? null : sub.updatedAt,
      partialAt: sub.partial ? sub.updatedAt : null,
      visit: (sub.visit as any) ?? null,
    };
  }

  async deleteSubmission(accountId: string, submissionId: string): Promise<boolean> {
    return this.store.deleteSubmission(accountId, submissionId);
  }

  async deleteSubmissions(accountId: string, formId: string, ids: string[]): Promise<number> {
    return this.store.deleteSubmissions(accountId, formId, ids);
  }

  // Folders
  async listFolders(accountId: string): Promise<Folder[]> {
    return this.store.listFolders(accountId);
  }

  async createFolder(accountId: string, name: string): Promise<Folder> {
    return this.store.createFolder(accountId, name);
  }

  async renameFolder(accountId: string, folderId: string, name: string): Promise<Folder> {
    return this.store.renameFolder(accountId, folderId, name);
  }

  async deleteFolder(accountId: string, folderId: string): Promise<boolean> {
    return this.store.deleteFolder(accountId, folderId);
  }

  async setFormFolder(accountId: string, formId: string, folderId: string | null) {
    const form = await this.store.setFormFolder(accountId, formId, folderId);
    return { id: form.id, folderId: form.folderId ?? null };
  }

  // Branding
  async getBranding(_accountId: string): Promise<BrandingResponse> {
    return { config: null, updatedAt: null };
  }

  async saveBranding(_accountId: string, config: BrandKit): Promise<BrandingResponse> {
    return { config, updatedAt: Date.now() };
  }

  // Notifications
  async getNotifications(_accountId: string): Promise<NotificationsResponse> {
    return { settings: [] };
  }

  async getFormNotifications(_accountId: string, _formId: string): Promise<FormNotificationsResponse> {
    return { settings: [] };
  }

  // Integrations
  async listIntegrations(_accountId: string) {
    return { encryptionAvailable: false, providers: [] };
  }

  async listAccountWebhooks(_accountId: string) {
    return { items: [] };
  }

  // Link pages
  async linkPages(accountId: string): Promise<LinkPagesListView> {
    const account = await this.store.getAccountById(accountId);
    return { accountCode: account?.code ?? 'acme', max: 20, pages: [] };
  }

  async linkPage(accountId: string): Promise<LinkPageEditorView> {
    const account = await this.store.getAccountById(accountId);
    return {
      id: null,
      slug: null,
      name: null,
      isDefault: true,
      accountCode: account?.code ?? 'acme',
      accountName: account?.name ?? 'Acme Inc.',
      page: null,
      forms: [],
      brandKit: null,
      publicUrl: null,
      live: false,
    };
  }

  // Members
  async listMembers(accountId: string): Promise<AccountMember[]> {
    const members = await this.store.listAccountMembers(accountId);
    return members.map((m) => ({
      id: m.id,
      email: m.email,
      displayName: m.displayName,
      handle: m.displayName,
      avatarUrl: null,
      role: m.role,
      status: m.status,
      createdAt: m.createdAt,
    }));
  }

  async listInvitations(_accountId: string): Promise<PendingInvitation[]> {
    return [];
  }

  // Vanity
  async vanityStatus(accountId: string) {
    const account = await this.store.getAccountById(accountId);
    return { vanitySlug: account?.vanitySlug ?? null, shortCode: account?.code ?? 'acme', canClaim: true };
  }
}

export const adminService = new AdminService();
