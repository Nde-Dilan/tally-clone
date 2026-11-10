/**
 * DataStore factory — provides the active DataStore instance.
 * Automatically selects FirestoreDataStore if FIREBASE_PROJECT_ID is set,
 * otherwise defaults to SqlDataStore (SQLite in local dev, Postgres if DATABASE_URL).
 */
import type { DataStore } from './types';
import { SqlDataStore } from './sql-store';

export * from './types';
export * from './sql-store';
export * from './firestore-store';

let activeStore: DataStore | null = null;

export function getDataStore(): DataStore {
  if (activeStore) return activeStore;

  if (process.env.FIREBASE_PROJECT_ID) {
    const { FirestoreDataStore } = require('./firestore-store');
    activeStore = new FirestoreDataStore();
    return activeStore!;
  }

  activeStore = new SqlDataStore();
  return activeStore!;
}
