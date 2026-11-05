import { getDB, safeDb } from '../db';
import type { Measurement } from '@/types';

export const measurementsRepo = {
  async all(): Promise<Measurement[]> {
    return safeDb(async () => (await getDB()).getAll('measurements'), [], 'measurements.all');
  },
  async put(m: Measurement): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('measurements', m); }, undefined, 'measurements.put');
  },
  async delete(id: string): Promise<void> {
    await safeDb(async () => { await (await getDB()).delete('measurements', id); }, undefined, 'measurements.delete');
  }
};
