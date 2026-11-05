import { getDB, safeDb } from '../db';
import type { AppSettings, PlanTemplateMeal } from '@/types';

export type FullSettings = AppSettings & { planTemplate: PlanTemplateMeal[] };

export const settingsRepo = {
  async get(): Promise<FullSettings | undefined> {
    return safeDb(async () => (await getDB()).get('settings', 'app'), undefined, 'settings.get');
  },
  async put(s: FullSettings): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('settings', { ...s, id: 'app' }); }, undefined, 'settings.put');
  }
};
