import { getDB, safeDb } from '../db';
import type { Profile } from '@/types';

export const profileRepo = {
  async get(): Promise<Profile | undefined> {
    return safeDb(async () => (await getDB()).get('profile', 'me'), undefined, 'profile.get');
  },
  async put(p: Profile): Promise<void> {
    await safeDb(async () => {
      await (await getDB()).put('profile', { ...p, id: 'me', updatedAt: Date.now() });
    }, undefined, 'profile.put');
  }
};
