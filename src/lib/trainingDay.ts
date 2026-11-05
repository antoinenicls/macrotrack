import type { PlanTemplateMeal } from '@/types';
import type { FoodResolver } from '@/data/seedWeeklyRotation';
import { toNativeGrams } from './nutrition';
import { quantizeGrams } from './portions';

/* =========================================================================
 *  Jour de SÉANCE : collation pré-training pour une seule date.
 *
 *  Les jours d'entraînement ne sont pas fixes : l'utilisateur déclare « séance
 *  aujourd'hui » le jour même. La collation reçoit alors le bloc pré-training
 *  (galettes de riz + miel + banane : glucides rapides, peu de gras et de fibres) ;
 *  ses protéines (fromage blanc, whey) ET ses oléagineux sont gardés (mangés après la
 *  séance), seuls ses glucides / fruits / appoints (fruits rouges, crème de riz) sont
 *  retirés. Le bloc est servi TEL QUEL (ce sont les quantités réellement mangées).
 *
 *  Ses calories sont compensées en réduisant d'un MÊME pourcentage tous les féculents
 *  et matières grasses du reste de la journée (protéines intactes), chacun gardant au
 *  moins MIN_SHARE de sa portion normale. Ne PAS faire porter toute la compensation sur
 *  les seuls féculents (via le solveur macro) : sur une cible de sèche basse, il y en a
 *  trop peu et ils tombaient à quelques grammes (riz, pâtes, flocons à 1-8 g). Si le
 *  plancher ne suffit pas, la journée dépasse un peu sa cible plutôt que de proposer des
 *  portions absurdes : un jour d'entraînement le supporte. Pur, sans I/O.
 * ========================================================================= */

/**
 * Collation pré-training, quantités fixes : 4 galettes (2 = 15 g), 1 banane moyenne,
 * ½ c.à.c de miel par galette (~3,5 g). La cannelle n'est pas comptée (~2 kcal).
 */
export const PRE_WORKOUT_ITEMS: PlanTemplateMeal['items'] = [
  { foodId: 'galettes-riz-complet', grams: 30, cooked: false },
  { foodId: 'banane', grams: 110, cooked: false },
  { foodId: 'miel-fleurs', grams: 14, cooked: false }
];

/** Séances par semaine supposées tant que l'utilisateur ne l'a pas réglé (liste de courses). */
export const DEFAULT_SESSIONS_PER_WEEK = 3;

/** Une journée (plan ou log) est une journée de séance si elle contient le bloc pré-training. */
export function isTrainingDay(meals: Array<{ items: Array<{ foodId: string }> }>): boolean {
  const marker = PRE_WORKOUT_ITEMS[0].foodId;
  return meals.some((m) => m.items.some((it) => it.foodId === marker));
}

/**
 * Bloc pré-training à prévoir sur la liste de courses. Les séances étant déclarées le jour
 * même, les jours à venir n'en contiennent pas encore : on ajoute le bloc pour les séances
 * de la semaine qui ne figurent pas déjà dans un jour (déjà faites ou déclarées).
 */
export function pendingTrainingItems(sessionsPerWeek: number, sessionsAlreadyCounted: number): PlanTemplateMeal['items'] {
  const left = Math.max(0, Math.round(sessionsPerWeek) - sessionsAlreadyCounted);
  if (left === 0) return [];
  return PRE_WORKOUT_ITEMS.map((it) => ({ ...it, grams: it.grams * left }));
}

/** Totaux kcal / protéines / lipides d'une liste d'items. */
export function itemsTotals(items: PlanTemplateMeal['items'], byId: FoodResolver) {
  let kcal = 0, protein = 0, fat = 0;
  for (const it of items) {
    const f = byId(it.foodId);
    if (!f) continue;
    const g = toNativeGrams(f, it.grams, it.cooked) / 100;
    kcal += f.kcalPer100g * g;
    protein += f.proteinPer100g * g;
    fat += f.fatPer100g * g;
  }
  return { kcal, protein, fat };
}

/** Catégories gardées dans la collation d'un jour de séance (mangées après l'entraînement). */
const KEPT_IN_COLLATION = new Set(['proteine', 'lipide']);
/** Catégories réduites pour faire de la place au bloc (les protéines ne bougent jamais). */
export const FLEXIBLE = new Set(['glucide', 'lipide']);
/** Part minimale gardée de chaque féculent / matière grasse : jamais de portion ridicule. */
export const MIN_SHARE = 0.6;

const allItems = (day: PlanTemplateMeal[]) => day.flatMap((m) => m.items);

/**
 * Transforme le plan d'une journée en journée de séance, à calories égales tant que le
 * plancher MIN_SHARE le permet (que le jour soit normal ou déjà en recharge). `isBlocked`
 * écarte un aliment du bloc exclu par le profil alimentaire. Sans collation, elle est créée.
 */
export function buildTrainingDayPlan(
  day: PlanTemplateMeal[],
  byId: FoodResolver,
  isBlocked?: (foodId: string) => boolean
): PlanTemplateMeal[] {
  const block = PRE_WORKOUT_ITEMS.filter((it) => byId(it.foodId) && !(isBlocked?.(it.foodId) ?? false));
  const targetKcal = itemsTotals(allItems(day), byId).kcal;

  // Collation réduite à ses protéines et oléagineux ; le bloc la complète à la fin.
  const rest = day.map((m) =>
    m.slot === 'collation'
      ? { slot: m.slot, items: m.items.filter((it) => KEPT_IN_COLLATION.has(byId(it.foodId)?.category ?? '')) }
      : { slot: m.slot, items: [...m.items] }
  );

  // Calories en trop une fois le bloc ajouté, à retirer des féculents / matières grasses.
  const isFlexible = (foodId: string) => FLEXIBLE.has(byId(foodId)?.category ?? '');
  const excess = itemsTotals(allItems(rest), byId).kcal + itemsTotals(block, byId).kcal - targetKcal;
  const flexKcal = itemsTotals(allItems(rest).filter((it) => isFlexible(it.foodId)), byId).kcal;
  const share = excess > 0 && flexKcal > 0 ? Math.max(MIN_SHARE, 1 - excess / flexKcal) : 1;

  const scaled = rest.map((m) => ({
    slot: m.slot,
    items: m.items.map((it) =>
      share < 1 && isFlexible(it.foodId)
        ? { ...it, grams: quantizeGrams(byId(it.foodId), it.grams * share, it.cooked) }
        : it
    )
  }));

  const hasCollation = scaled.some((m) => m.slot === 'collation');
  const withBlock = hasCollation
    ? scaled.map((m) => (m.slot === 'collation' ? { slot: m.slot, items: [...m.items, ...block] } : m))
    : [...scaled, { slot: 'collation' as const, items: block }];
  return withBlock.filter((m) => m.items.length > 0);
}
