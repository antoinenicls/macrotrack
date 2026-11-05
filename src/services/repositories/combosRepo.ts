import { getDB, safeDb } from '../db';
import type { Combo } from '@/types';

export const combosRepo = {
  async all(): Promise<Combo[]> {
    return safeDb(async () => (await getDB()).getAll('combos'), [], 'combos.all');
  },
  async put(c: Combo): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('combos', c); }, undefined, 'combos.put');
  },
  async delete(id: string): Promise<void> {
    await safeDb(async () => { await (await getDB()).delete('combos', id); }, undefined, 'combos.delete');
  }
};
