import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Food, Combo, Meal, WeightEntry, Measurement, ProgressPhoto, Profile, AppSettings, PlanTemplateMeal } from '@/types';

/**
 * Schéma IndexedDB. Toute évolution => bump DB_VERSION + branche dans `upgrade`.
 * On garde le profil et les settings comme singletons (id="me" / id="app").
 */
export interface MacroDB extends DBSchema {
  profile:      { key: string; value: Profile };
  settings:     { key: string; value: AppSettings & { planTemplate: PlanTemplateMeal[] } };
  foods:        { key: string; value: Food };
  combos:       { key: string; value: Combo };
  meals:        { key: string; value: Meal; indexes: { 'by-date': string } };
  weights:      { key: string; value: WeightEntry; indexes: { 'by-date': string } };
  measurements: { key: string; value: Measurement; indexes: { 'by-date': string } };
  photos:       { key: string; value: ProgressPhoto; indexes: { 'by-date': string } };
}

const DB_NAME = 'macrotrack';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MacroDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<MacroDB>> {
  if (!dbPromise) {
    dbPromise = openDB<MacroDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('profile'))      db.createObjectStore('profile',      { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings'))     db.createObjectStore('settings',     { keyPath: 'id' });
        if (!db.objectStoreNames.contains('foods'))        db.createObjectStore('foods',        { keyPath: 'id' });
        if (!db.objectStoreNames.contains('combos'))       db.createObjectStore('combos',       { keyPath: 'id' });

        if (!db.objectStoreNames.contains('meals')) {
          const s = db.createObjectStore('meals', { keyPath: 'id' });
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('weights')) {
          const s = db.createObjectStore('weights', { keyPath: 'id' });
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('measurements')) {
          const s = db.createObjectStore('measurements', { keyPath: 'id' });
          s.createIndex('by-date', 'date');
        }
        if (!db.objectStoreNames.contains('photos')) {
          const s = db.createObjectStore('photos', { keyPath: 'id' });
          s.createIndex('by-date', 'date');
        }
      },
      blocked() { console.warn('[db] upgrade blocked by another tab'); },
      blocking() { console.warn('[db] blocking another tab'); }
    });
  }
  return dbPromise;
}

/** Helper try/catch homogène pour toutes les opérations DB. */
export async function safeDb<T>(op: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await op();
  } catch (err) {
    console.error(`[db:${label}]`, err);
    return fallback;
  }
}
