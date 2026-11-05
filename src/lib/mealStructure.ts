import type { MealSlot, PlanTemplateMeal } from '@/types';
import { MEAL_SLOTS } from '@/types';

/* =========================================================================
 *  Structure des repas : combien, et lesquels.
 *
 *  La rotation est écrite en 4 repas (petit-déjeuner, déjeuner, dîner,
 *  collation), ce qui ne convient pas à tout le monde : jeûne 16/8, trois repas
 *  sans collation, pas le temps de petit-déjeuner. Plutôt que de réécrire sept
 *  menus par configuration, on REDISTRIBUE : les aliments d'un repas désactivé
 *  sont reversés dans le repas actif le plus proche.
 *
 *  Conséquence importante et voulue : la journée garde EXACTEMENT les mêmes
 *  aliments et les mêmes quantités, donc les mêmes calories et les mêmes
 *  macros. Sauter le petit-déjeuner ne fait pas maigrir plus vite, ça déplace
 *  les calories ; l'app ne doit pas laisser croire le contraire.
 *  Pur, sans I/O → testable.
 * ========================================================================= */

/** Ordre chronologique des repas dans la journée. */
export const SLOT_ORDER: readonly MealSlot[] = MEAL_SLOTS;

export interface MealStructurePreset {
  id: string;
  label: string;
  slots: readonly MealSlot[];
  hint: string;
}

export const MEAL_PRESETS: readonly MealStructurePreset[] = [
  {
    id: 'quatre', label: '4 repas', slots: MEAL_SLOTS,
    hint: 'Petit-déj, déjeuner, dîner et une collation.'
  },
  {
    id: 'trois', label: '3 repas', slots: ['petit-dej', 'dejeuner', 'diner'],
    hint: 'Sans collation : elle est reversée dans le dîner.'
  },
  {
    id: 'jeune-16-8', label: 'Jeûne 16/8', slots: ['dejeuner', 'diner', 'collation'],
    hint: 'Pas de petit-déjeuner : il est reversé dans le déjeuner.'
  },
  {
    id: 'deux', label: '2 repas', slots: ['dejeuner', 'diner'],
    hint: 'Deux gros repas. Les portions deviennent copieuses.'
  }
];

/** Repas réellement actifs. Absent = les quatre (comportement historique). */
export function activeSlotsOf(configured: MealSlot[] | undefined): MealSlot[] {
  const set = new Set(configured ?? MEAL_SLOTS);
  const out = MEAL_SLOTS.filter((s) => set.has(s));
  // Garde-fou : une journée sans aucun repas n'a pas de sens.
  return out.length > 0 ? out : [...MEAL_SLOTS];
}

/** Structure correspondant exactement à un préréglage, s'il y en a un. */
export function matchingMealPreset(slots: MealSlot[] | undefined): MealStructurePreset | undefined {
  const active = activeSlotsOf(slots);
  return MEAL_PRESETS.find(
    (p) => p.slots.length === active.length && p.slots.every((s) => active.includes(s))
  );
}

/**
 * Repas actif qui récupère les aliments d'un repas désactivé : le plus proche dans la
 * journée, en privilégiant le plus tôt à distance égale (on avance le repas plutôt que de
 * le repousser tard le soir).
 */
function receiverFor(slot: MealSlot, active: MealSlot[]): MealSlot {
  const i = SLOT_ORDER.indexOf(slot);
  let best = active[0];
  let bestD = Infinity;
  for (const a of active) {
    const d = Math.abs(SLOT_ORDER.indexOf(a) - i);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/**
 * Applique la structure de repas au plan d'UNE journée : les repas désactivés sont vidés
 * dans le repas actif le plus proche, et les doublons d'un même aliment sont fusionnés
 * (sinon on afficherait deux fois « poulet » dans la même assiette).
 * Les macros de la journée sont rigoureusement inchangées.
 */
export function applyMealStructureToDay(
  meals: PlanTemplateMeal[],
  configured: MealSlot[] | undefined
): PlanTemplateMeal[] {
  const active = activeSlotsOf(configured);
  if (active.length === MEAL_SLOTS.length) return meals;

  const buckets = new Map<MealSlot, PlanTemplateMeal['items']>();
  for (const s of active) buckets.set(s, []);

  for (const m of meals) {
    const target = active.includes(m.slot) ? m.slot : receiverFor(m.slot, active);
    buckets.get(target)!.push(...m.items);
  }

  return active.map((slot) => {
    // Fusion des doublons : même aliment ET même unité de saisie (cru/cuit).
    const merged: PlanTemplateMeal['items'] = [];
    for (const it of buckets.get(slot)!) {
      const found = merged.find((x) => x.foodId === it.foodId && x.cooked === it.cooked);
      if (found) found.grams += it.grams;
      else merged.push({ ...it });
    }
    return { slot, items: merged };
  });
}

/** Idem sur les 7 jours de la rotation. */
export function applyMealStructure(
  plan: Record<string, PlanTemplateMeal[]>,
  configured: MealSlot[] | undefined
): Record<string, PlanTemplateMeal[]> {
  const active = activeSlotsOf(configured);
  if (active.length === MEAL_SLOTS.length) return plan;
  const out: Record<string, PlanTemplateMeal[]> = {};
  for (const [day, meals] of Object.entries(plan)) {
    out[day] = applyMealStructureToDay(meals, configured);
  }
  return out;
}
