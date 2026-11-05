import { getDB, safeDb } from '../db';
import type { Meal } from '@/types';

export const mealsRepo = {
  async byDate(date: string): Promise<Meal[]> {
    return safeDb(async () => (await getDB()).getAllFromIndex('meals', 'by-date', date), [], 'meals.byDate');
  },
  async all(): Promise<Meal[]> {
    return safeDb(async () => (await getDB()).getAll('meals'), [], 'meals.all');
  },
  async put(meal: Meal): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('meals', meal); }, undefined, 'meals.put');
  },
  async delete(id: string): Promise<void> {
    await safeDb(async () => { await (await getDB()).delete('meals', id); }, undefined, 'meals.delete');
  },
  async deleteByDate(date: string): Promise<void> {
    await safeDb(async () => {
      const db = await getDB();
      const tx = db.transaction('meals', 'readwrite');
      const all = await tx.store.index('by-date').getAllKeys(date);
      await Promise.all(all.map((k) => tx.store.delete(k)));
      await tx.done;
    }, undefined, 'meals.deleteByDate');
  }
};
