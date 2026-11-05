import type { Food, MacroTargets, Meal, MealSlot, PlanTemplateMeal } from '@/types';
import { macrosForItem, sumMacros } from './nutrition';
import { addDays, dayKey, parseDayKey } from './dates';
import { quantizeGrams } from './portions';
import { FLEXIBLE, MIN_SHARE, PRE_WORKOUT_ITEMS, itemsTotals } from './trainingDay';

/* =========================================================================
 *  Repas ESTIMÉ (non pesé) : le reste de la journée se recale autour.
 *
 *  Un repas pris dehors remplace le repas prévu de son créneau, mais ses calories
 *  diffèrent rarement de celles prévues. L'écart est reporté sur les repas PAS ENCORE
 *  ENTAMÉS au moment de l'estimation (figés dans `MealEstimate.rebalanceSlots`, pour que
 *  cocher un aliment ensuite ne relance pas le calcul), même règle que le jour de séance :
 *  féculents et matières grasses réduits / augmentés d'un même pourcentage, protéines
 *  intactes.
 *
 *  Asymétrique, parce qu'on sous-estime presque toujours un repas pris dehors (huile,
 *  beurre, sauces invisibles) :
 *   - repas plus lourd que prévu → compensé en entier, sans descendre sous MIN_SHARE de
 *     chaque portion ; le surplus est signalé « non compensable » plutôt que de proposer
 *     un dîner ridicule ;
 *   - plus léger → on ne rajoute que la MOITIÉ de l'écart, plafonné à MAX_SHARE.
 *
 *  Calculé à l'affichage depuis le log : modifier ou supprimer l'estimation recale (ou
 *  rétablit) la journée sans rien persister d'autre. Pur, sans I/O.
 *
 *  REPORT : le surplus non compensable du jour (mémorisé par date, cf.
 *  AppSettings.estimateSurplus) est retiré des féculents et du gras des `days` jours
 *  suivants, à parts égales, sans jamais dépasser `maxShare` de la journée : la semaine
 *  compte plus que la journée, et une restriction douce ne déclenche pas le cycle
 *  écart → restriction → écart. Sous `minKcal`, c'est du bruit (plus petit que
 *  l'imprécision de l'estimation) : rien n'est reporté. Au-delà du plafond, on laisse filer.
 *  Réglable par l'utilisateur (AppSettings.estimateCarry), DEFAULT_CARRY sinon.
 * ========================================================================= */

/** Part de l'écart rajoutée quand le repas estimé est plus léger que prévu. */
export const UNDER_COMPENSATION = 0.5;
/** Portion maximale des féculents / gras quand on rajoute des calories. */
export const MAX_SHARE = 1.2;
/** En dessous de cet ajustement (kcal), on ne touche pas aux portions. */
const MIN_ADJUST_KCAL = 30;
/** Manque de protéines (g) à partir duquel on le signale. */
export const PROTEIN_GAP_ALERT_G = 10;

export interface CarrySettings {
  /** Report activé (l'utilisateur peut le couper : le surplus est alors laissé de côté). */
  enabled: boolean;
  /** Nombre de jours sur lesquels un surplus non compensable est reporté. */
  days: number;
  /** Surplus minimal (kcal) pour être reporté. */
  minKcal: number;
  /** Part maximale des calories d'une journée retirée par le report. */
  maxShare: number;
}

export const DEFAULT_CARRY: CarrySettings = { enabled: true, days: 2, minKcal: 150, maxShare: 0.1 };
/** Report le plus long proposé : fenêtre de conservation des surplus. */
export const MAX_CARRY_DAYS = 3;

/** Réglages de report de l'utilisateur, complétés par les valeurs par défaut. */
export function carrySettingsOf(settings: { estimateCarry?: Partial<CarrySettings> } | null | undefined): CarrySettings {
  return { ...DEFAULT_CARRY, ...settings?.estimateCarry };
}

const BLOCK_IDS = new Set(PRE_WORKOUT_ITEMS.map((it) => it.foodId));

export interface EstimateRebalance {
  /** Plan du jour à afficher (inchangé sans repas estimé). */
  plan: PlanTemplateMeal[];
  /** Repas estimés : logué − prévu sur leurs créneaux (+ = plus que prévu). */
  deltaKcal: number;
  /** Calories effectivement ajoutées (+) ou retirées (−) sur les repas restants. */
  adjustedKcal: number;
  /** Surplus qui ne rentre pas dans le plancher des portions (≥ 0). */
  uncompensatedKcal: number;
  /** Protéines manquantes vs prévu sur les créneaux estimés (≥ 0). */
  proteinGapG: number;
  /** Créneaux dont les portions ont été ajustées. */
  adjustedSlots: MealSlot[];
}

/** Créneaux du plan pas encore entamés (aucun item logué), hors `slot` : ceux qu'une estimation peut recaler. */
export function pendingSlots(plan: PlanTemplateMeal[], meals: Meal[], slot: MealSlot): MealSlot[] {
  return plan
    .filter((m) => m.slot !== slot && m.items.length > 0)
    .filter((m) => !meals.some((meal) => meal.slot === m.slot && meal.items.length > 0))
    .map((m) => m.slot);
}

export function rebalanceForEstimates(
  plan: PlanTemplateMeal[],
  meals: Meal[],
  byId: (id: string) => Food | undefined
): EstimateRebalance {
  const none: EstimateRebalance = { plan, deltaKcal: 0, adjustedKcal: 0, uncompensatedKcal: 0, proteinGapG: 0, adjustedSlots: [] };
  const estimated = meals.filter((m) => m.items.some((it) => it.estimate));
  if (estimated.length === 0) return none;

  // Écart des créneaux estimés : tout ce qui y est logué (estimation + éventuels aliments
  // cochés en plus) face à ce qui y était prévu.
  let deltaKcal = 0, proteinGap = 0;
  const estimatedSlots = new Set<MealSlot>();
  const eligible = new Set<MealSlot>();
  for (const meal of estimated) {
    estimatedSlots.add(meal.slot);
    const logged = sumMacros(meal.items.map((it) => macrosForItem(byId(it.foodId), it)));
    const planned = itemsTotals(plan.find((m) => m.slot === meal.slot)?.items ?? [], byId);
    deltaKcal += logged.kcal - planned.kcal;
    proteinGap += planned.protein - logged.protein;
    for (const it of meal.items) for (const s of it.estimate?.rebalanceSlots ?? []) eligible.add(s);
  }
  for (const s of estimatedSlots) eligible.delete(s);

  const result = { ...none, deltaKcal: Math.round(deltaKcal), proteinGapG: Math.max(0, Math.round(proteinGap)) };
  const isFlexible = (slot: MealSlot, foodId: string) =>
    eligible.has(slot) && !BLOCK_IDS.has(foodId) && FLEXIBLE.has(byId(foodId)?.category ?? '');
  const flexKcal = itemsTotals(plan.flatMap((m) => m.items.filter((it) => isFlexible(m.slot, it.foodId))), byId).kcal;

  const wanted = deltaKcal > 0 ? -deltaKcal : -deltaKcal * UNDER_COMPENSATION;
  if (flexKcal <= 0 || Math.abs(wanted) < MIN_ADJUST_KCAL) {
    return { ...result, uncompensatedKcal: Math.max(0, result.deltaKcal) };
  }
  const share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, 1 + wanted / flexKcal));

  const adjustedSlots = new Set<MealSlot>();
  const next = plan.map((m) => ({
    slot: m.slot,
    items: m.items.map((it) => {
      if (!isFlexible(m.slot, it.foodId)) return it;
      const grams = quantizeGrams(byId(it.foodId), it.grams * share, it.cooked);
      if (grams !== it.grams) adjustedSlots.add(m.slot);
      return { ...it, grams };
    })
  }));

  const total = (p: PlanTemplateMeal[]) => itemsTotals(p.flatMap((m) => m.items), byId).kcal;
  const adjustedKcal = Math.round(total(next) - total(plan));
  return {
    ...result,
    plan: next,
    adjustedKcal,
    uncompensatedKcal: deltaKcal > 0 ? Math.max(0, Math.round(deltaKcal + adjustedKcal)) : 0,
    adjustedSlots: plan.map((m) => m.slot).filter((s) => adjustedSlots.has(s))
  };
}

/** Calories totales d'un plan. */
export function planKcal(plan: PlanTemplateMeal[], byId: (id: string) => Food | undefined): number {
  return itemsTotals(plan.flatMap((m) => m.items), byId).kcal;
}

/** Calories retirées CHAQUE jour suivant pour un surplus donné (0 sous le seuil). */
export function carryPerDay(surplusKcal: number, dayKcal: number, cfg: CarrySettings = DEFAULT_CARRY): number {
  if (!cfg.enabled || cfg.days <= 0 || surplusKcal < cfg.minKcal) return 0;
  return Math.round(Math.min(surplusKcal / cfg.days, dayKcal * cfg.maxShare));
}

/**
 * Calories à retirer le jour `date` : la part des surplus des `days` jours précédents,
 * plafonnée à `maxShare` de la journée même quand deux écarts se suivent.
 */
export function carryOverFor(
  date: string,
  surplus: Record<string, number> | undefined,
  dayKcal: number,
  cfg: CarrySettings = DEFAULT_CARRY
): number {
  if (!surplus || dayKcal <= 0 || !cfg.enabled || cfg.days <= 0) return 0;
  let kcal = 0;
  for (let i = 1; i <= cfg.days; i++) {
    const s = surplus[dayKey(addDays(parseDayKey(date), -i))] ?? 0;
    if (s >= cfg.minKcal) kcal += s / cfg.days;
  }
  return Math.round(Math.min(kcal, dayKcal * cfg.maxShare));
}

/** Retire `kcal` des féculents et du gras du plan (même pourcentage, protéines intactes). */
export function applyCarryOver(
  plan: PlanTemplateMeal[],
  kcal: number,
  byId: (id: string) => Food | undefined
): PlanTemplateMeal[] {
  if (kcal <= 0) return plan;
  const isFlexible = (foodId: string) => !BLOCK_IDS.has(foodId) && FLEXIBLE.has(byId(foodId)?.category ?? '');
  const flexKcal = itemsTotals(plan.flatMap((m) => m.items.filter((it) => isFlexible(it.foodId))), byId).kcal;
  if (flexKcal <= 0) return plan;
  const share = Math.max(MIN_SHARE, 1 - kcal / flexKcal);
  return plan.map((m) => ({
    slot: m.slot,
    items: m.items.map((it) =>
      isFlexible(it.foodId) ? { ...it, grams: quantizeGrams(byId(it.foodId), it.grams * share, it.cooked) } : it
    )
  }));
}

/** Cibles du jour allégées de `kcal`, retirés des glucides et lipides au prorata (protéines intactes). */
export function reduceTargets(targets: MacroTargets, kcal: number): MacroTargets {
  if (kcal <= 0) return targets;
  const carbsKcal = targets.carbs * 4, fatKcal = targets.fat * 9;
  const flex = carbsKcal + fatKcal;
  if (flex <= 0) return { ...targets, kcal: targets.kcal - kcal };
  return {
    kcal: Math.round(targets.kcal - kcal),
    protein: targets.protein,
    carbs: Math.round(targets.carbs - (kcal * carbsKcal) / flex / 4),
    fat: Math.round(targets.fat - (kcal * fatKcal) / flex / 9)
  };
}
