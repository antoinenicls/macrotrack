import { getDB, safeDb } from '../db';
import type { WeightEntry } from '@/types';

export const weightsRepo = {
  async all(): Promise<WeightEntry[]> {
    return safeDb(async () => (await getDB()).getAll('weights'), [], 'weights.all');
  },
  async byDate(date: string): Promise<WeightEntry | undefined> {
    const list = await safeDb(async () => (await getDB()).getAllFromIndex('weights', 'by-date', date), [], 'weights.byDate');
    return list[0];
  },
  async put(w: WeightEntry): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('weights', w); }, undefined, 'weights.put');
  },
  async delete(id: string): Promise<void> {
    await safeDb(async () => { await (await getDB()).delete('weights', id); }, undefined, 'weights.delete');
  }
};
