import type { Food, Meal, Profile, WeightEntry, MealEstimate } from '@/types';
import { dayKey, subDays } from '@/lib/dates';

/* =========================================================================
 *  Fixtures partagées pour la suite de tests du moteur de coaching.
 *  Toutes les dates sont construites RELATIVEMENT à aujourd'hui (comme l'app :
 *  lastNDays/buildTrend s'appuient sur `new Date()`), pour tester le moteur
 *  exactement dans les conditions réelles d'exécution.
 * ========================================================================= */

/** Aliment synthétique « 1 kcal/g » → grams saisis = kcal du repas. */
export const KCAL_FOOD: Food = {
  id: 'kcal',
  name: 'Synthetic kcal',
  kcalPer100g: 100,
  proteinPer100g: 10, // 10 g P / 100 g
  carbsPer100g: 12,
  fatPer100g: 2,
  category: 'autre',
  isCustom: false,
  state: 'raw',
  createdAt: 0
};

/** Riz blanc sec (state raw, cookedFactor 2.5) pour tester cru/cuit. */
export const RICE_RAW: Food = {
  id: 'riz',
  name: 'Riz blanc',
  kcalPer100g: 350,
  proteinPer100g: 7,
  carbsPer100g: 78,
  fatPer100g: 0.6,
  category: 'glucide',
  isCustom: false,
  state: 'raw',
  cookedFactor: 2.5,
  createdAt: 0
};

/** Poulet (macros en CUIT, state cooked, cookedFactor 0.7). */
export const CHICKEN_COOKED: Food = {
  id: 'poulet',
  name: 'Poulet',
  kcalPer100g: 165,
  proteinPer100g: 31,
  carbsPer100g: 0,
  fatPer100g: 3.6,
  category: 'proteine',
  isCustom: false,
  state: 'cooked',
  cookedFactor: 0.7,
  createdAt: 0
};

export const FOODS: Food[] = [KCAL_FOOD, RICE_RAW, CHICKEN_COOKED];
export const foodById = (id: string): Food | undefined => FOODS.find((f) => f.id === id);

/** Profil de test : H, 21 ans, 180 cm, 84.85 kg, 15% MG, moderate. */
export const BASE_PROFILE: Profile = {
  id: 'me',
  sex: 'M',
  ageYears: 21,
  heightCm: 180,
  weightKg: 84.85,
  bodyFatPct: 15,
  activity: 'moderate',
  proteinPerKg: 2.2,
  fatPerKg: 0.9,
  updatedAt: 0
};

export function profileWith(overrides: Partial<Profile>): Profile {
  return { ...BASE_PROFILE, ...overrides };
}

/**
 * Série de pesées sur `days` jours finissant aujourd'hui, perte linéaire de
 * `kgPerWeek` (positif = perte). `startKg` = poids le plus ANCIEN.
 * `everyDays` permet de simuler des pesées espacées (ex. tous les 2 j).
 */
export function weightSeries(opts: {
  days: number;
  startKg: number;
  kgPerWeek: number;
  everyDays?: number;
  jitter?: number; // bruit hydrique pseudo-aléatoire déterministe
}): WeightEntry[] {
  const { days, startKg, kgPerWeek, everyDays = 1, jitter = 0 } = opts;
  const out: WeightEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const ageDays = i; // i jours avant aujourd'hui
    if (ageDays % everyDays !== 0) continue;
    const elapsed = days - 1 - ageDays; // jours depuis le début
    const kg = startKg - (kgPerWeek / 7) * elapsed + (jitter ? jitter * Math.sin(elapsed) : 0);
    out.push({ id: `w${i}`, date: dayKey(subDays(new Date(), ageDays)), kg: Math.round(kg * 100) / 100 });
  }
  return out;
}

/** Un repas synthétique de `kcal` à une date (en grammes de KCAL_FOOD). */
export function mealKcal(ageDays: number, kcal: number, slot: Meal['slot'] = 'dejeuner'): Meal {
  return {
    id: `m${ageDays}-${slot}`,
    date: dayKey(subDays(new Date(), ageDays)),
    slot,
    items: [{ foodId: 'kcal', grams: kcal, cooked: false }],
    createdAt: 0
  };
}

/** Repas « mangé à l'extérieur » (estimate) de `kcal` à une date. */
export function mealEstimate(ageDays: number, kcal: number, slot: Meal['slot'] = 'dejeuner'): Meal {
  const est: MealEstimate = { category: 'main-equilibre', kcal, protein: 30, carbs: 60, fat: 20 };
  return {
    id: `e${ageDays}-${slot}`,
    date: dayKey(subDays(new Date(), ageDays)),
    slot,
    items: [{ foodId: 'EATEN_OUT', grams: 0, cooked: false, estimate: est }],
    createdAt: 0
  };
}

/**
 * Série de repas : `kcal` constants par jour sur `days` jours finissant aujourd'hui.
 * `skipDays` = ensemble d'âges (jours avant aujourd'hui) à ne PAS logger (trous).
 */
export function mealSeries(opts: {
  days: number;
  kcal: number;
  skipAgeDays?: number[];
}): Meal[] {
  const { days, kcal, skipAgeDays = [] } = opts;
  const skip = new Set(skipAgeDays);
  const out: Meal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    if (skip.has(i)) continue;
    out.push(mealKcal(i, kcal));
  }
  return out;
}
