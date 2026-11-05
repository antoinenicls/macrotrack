import { combosRepo, foodsRepo, mealsRepo, measurementsRepo, profileRepo, settingsRepo, weightsRepo } from './repositories';
import type { Combo, Food, Meal, Measurement, Profile, WeightEntry } from '@/types';
import type { FullSettings } from './repositories/settingsRepo';

/**
 * Format d'export JSON. Versionné pour permettre des migrations futures.
 * Les photos (Blob) ne sont pas incluses (volume + complexité base64).
 */
export interface BackupV1 {
  version: 1;
  exportedAt: string;
  profile: Profile | null;
  settings: FullSettings | null;
  foods: Food[];
  combos: Combo[];
  meals: Meal[];
  weights: WeightEntry[];
  measurements: Measurement[];
}

export async function exportBackup(): Promise<BackupV1> {
  const [profile, settings, foods, combos, meals, weights, measurements] = await Promise.all([
    profileRepo.get(),
    settingsRepo.get(),
    foodsRepo.all(),
    combosRepo.all(),
    mealsRepo.all(),
    weightsRepo.all(),
    measurementsRepo.all()
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile ?? null,
    settings: settings ?? null,
    foods,
    combos,
    meals,
    weights,
    measurements
  };
}

export async function downloadBackup(): Promise<void> {
  const data = await exportBackup();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `macrotrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importBackup(json: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let data: BackupV1;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: 'JSON invalide.' };
  }
  if (data.version !== 1) return { ok: false, error: `Version non supportée (${data.version}).` };

  try {
    if (data.profile) await profileRepo.put(data.profile);
    if (data.settings) await settingsRepo.put(data.settings);
    if (data.foods.length) await foodsRepo.bulkPut(data.foods);
    for (const c of data.combos) await combosRepo.put(c);
    for (const m of data.meals) await mealsRepo.put(m);
    for (const w of data.weights) await weightsRepo.put(w);
    for (const m of data.measurements) await measurementsRepo.put(m);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
