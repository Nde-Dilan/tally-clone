import { describe, it, expect, vi } from 'vitest';
import { FirestoreDataStore } from './firestore-store';

describe('FirestoreDataStore getAnalytics', () => {
  it('applies date range filter and builds daily trends', async () => {
    const store = new FirestoreDataStore();

    const DAY = 86_400_000;
    const baseTime = 1730000000000; // Reference epoch

    const mockForm = {
      id: 'form-1',
      accountId: 'acc-1',
      name: 'Test Form',
      config: {
        version: 1,
        steps: [
          { key: 'q1', type: 'text', question: 'What is your name?' },
          { key: 'q2', type: 'text', question: 'What is your email?' },
        ],
      },
    };

    // Day 0: 1 view, 1 start, 1 submission
    // Day 5: 1 view, 1 start, 1 submission
    const mockEvents = [
      { id: 'e1', formId: 'form-1', type: 'view', sessionId: 's1', createdAt: baseTime },
      { id: 'e2', formId: 'form-1', type: 'start', sessionId: 's1', createdAt: baseTime + 1000 },
      { id: 'e3', formId: 'form-1', type: 'view', sessionId: 's2', createdAt: baseTime + 5 * DAY },
      { id: 'e4', formId: 'form-1', type: 'start', sessionId: 's2', createdAt: baseTime + 5 * DAY + 1000 },
    ];

    const mockSubmissions = [
      {
        id: 'sub-1',
        formId: 'form-1',
        createdAt: baseTime + 1000,
        updatedAt: baseTime + 20000,
        partial: false,
        visit: { source: 'google', medium: 'cpc' },
      },
      {
        id: 'sub-2',
        formId: 'form-1',
        createdAt: baseTime + 5 * DAY + 1000,
        updatedAt: baseTime + 5 * DAY + 30000,
        partial: false,
        visit: { source: 'twitter', medium: 'social' },
      },
      {
        id: 'sub-3',
        formId: 'form-1',
        createdAt: baseTime + 5 * DAY + 500,
        updatedAt: baseTime + 5 * DAY + 600,
        partial: true,
      },
    ];

    // Mock Firestore get
    (store as any).getFirestore = vi.fn().mockResolvedValue({
      collection: (name: string) => ({
        where: () => ({
          get: async () => ({
            docs: (name === 'form_events' ? mockEvents : mockSubmissions).map((data) => ({
              data: () => data,
            })),
          }),
        }),
      }),
    });

    (store as any).getFormById = vi.fn().mockResolvedValue(mockForm);

    // 1. All-time query (no range)
    const allTime = await store.getAnalytics('acc-1', 'form-1');
    expect(allTime.views).toBe(2);
    expect(allTime.starts).toBe(2);
    expect(allTime.submissions).toBe(2);
    expect(allTime.partialSubmits).toBe(1);
    expect(allTime.completionRate).toBe(100);
    expect(allTime.trafficSources).toHaveLength(2);
    expect(allTime.trends.length).toBeGreaterThan(0);

    // 2. Filtered range: only Day 5
    const filtered = await store.getAnalytics('acc-1', 'form-1', {
      from: baseTime + 4 * DAY,
      to: baseTime + 6 * DAY,
      tz: 'UTC',
    });
    expect(filtered.views).toBe(1);
    expect(filtered.starts).toBe(1);
    expect(filtered.submissions).toBe(1);
    expect(filtered.partialSubmits).toBe(1);
    expect(filtered.trafficSources).toHaveLength(1);
    expect(filtered.trafficSources[0]?.source).toBe('twitter');

    // 3. Filtered range: empty period (Day 10)
    const emptyRange = await store.getAnalytics('acc-1', 'form-1', {
      from: baseTime + 10 * DAY,
      to: baseTime + 11 * DAY,
      tz: 'UTC',
    });
    expect(emptyRange.views).toBe(0);
    expect(emptyRange.starts).toBe(0);
    expect(emptyRange.submissions).toBe(0);
    expect(emptyRange.partialSubmits).toBe(0);
  });
});
