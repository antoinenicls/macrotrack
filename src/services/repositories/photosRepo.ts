import { getDB, safeDb } from '../db';
import type { ProgressPhoto } from '@/types';

export const photosRepo = {
  async all(): Promise<ProgressPhoto[]> {
    return safeDb(async () => (await getDB()).getAll('photos'), [], 'photos.all');
  },
  async put(p: ProgressPhoto): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('photos', p); }, undefined, 'photos.put');
  },
  async delete(id: string): Promise<void> {
    await safeDb(async () => { await (await getDB()).delete('photos', id); }, undefined, 'photos.delete');
  }
};
