/**
 * AdminService — manages admin operations: workspaces, user info,
 * forms CRUD, duplication, publishing, and submissions.
 */
import type { FormConfig } from '@quill/engine';
import type { Me, Workspace } from '@/lib/admin-api';
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
}

export const adminService = new AdminService();
