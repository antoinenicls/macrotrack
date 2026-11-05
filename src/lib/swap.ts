import type { Food, PlanTemplateMeal } from '@/types';
import { toNativeGrams, fromNativeGrams } from './nutrition';
import { foodRole } from './foodSelection';
import { quantizeGrams, portionLabel } from './portions';
import { mergeMealItems } from './templates';

/* =========================================================================
 *  Remplacer un aliment du menu par un autre.
 *
 *  « Pas envie de poulet ce soir » est la demande de flexibilité la plus
 *  fréquente, et jusqu'ici elle imposait un détour par les réglages. Ce module
 *  calcule le grammage de l'aliment de remplacement et applique les
 *  remplacements durables au plan.
 *  Pur, sans I/O → testable.
 * ========================================================================= */

type Axis = 'protein' | 'carbs' | 'fat' | 'kcal' | 'grams';

/**
 * Ce qu'on cherche à conserver selon le rôle de l'aliment remplacé. Une seule variable
 * (le grammage) ne peut pas tout égaler à la fois : il faut choisir ce qui compte, et ça
 * dépend du rôle.
 *  - protéines : la protéine est la contrainte qui protège le muscle en sèche. Caler sur
 *    les calories ferait tomber 41 g de protéines à 17 en remplaçant du poulet par des œufs.
 *  - féculents et légumineuses : ce sont eux qui portent l'ajustement calorique de la
 *    journée. Caler sur les glucides ferait dériver les calories de près de 20 % entre riz
 *    et pâtes (densités en glucides très différentes à calories égales).
 *  - lipides : les calories y sont presque entièrement portées par les lipides, l'un vaut
 *    l'autre ; on garde l'axe explicite.
 *  - légumes : ce qu'on veut préserver, c'est le volume et la satiété, pas les calories.
 */
const AXIS_BY_ROLE: Record<ReturnType<typeof foodRole>, Axis> = {
  protein: 'protein',
  carb: 'kcal',
  legume: 'kcal',
  fat: 'fat',
  veg: 'grams',
  fruit: 'kcal',
  other: 'grams'
};

/** Quantité de l'axe apportée par un grammage donné, dans l'unité de saisie de l'item. */
function amountOn(axis: Axis, food: Food, grams: number, cooked: boolean): number {
  if (axis === 'grams') return grams;
  const k = toNativeGrams(food, grams, cooked) / 100;
  switch (axis) {
    case 'protein': return food.proteinPer100g * k;
    case 'carbs': return food.carbsPer100g * k;
    case 'fat': return food.fatPer100g * k;
    case 'kcal': return food.kcalPer100g * k;
  }
}

/**
 * Grammage de `to` qui remplace au mieux `from` à `grams`, en conservant ce qui compte
 * pour le rôle de l'aliment (cf. AXIS_BY_ROLE).
 *
 * Si l'aliment de remplacement n'apporte rien sur cet axe (une source de lipides sans
 * lipides, un aliment sans calories), on se rabat sur les calories puis sur le grammage
 * brut, plutôt que de diviser par zéro. Le résultat est borné par le plafond de portion
 * de l'aliment (cf. portionMaxG) : un remplacement ne doit pas produire une portion
 * absurde.
 */
export function equivalentGrams(
  from: Food, grams: number, fromCooked: boolean,
  to: Food, toCooked: boolean
): number {
  const axes: Axis[] = [AXIS_BY_ROLE[foodRole(from)], 'kcal', 'grams'];
  for (const axis of axes) {
    const perGram = amountOn(axis, to, 1, toCooked);
    if (perGram < 1e-9) continue;
    const g = amountOn(axis, from, grams, fromCooked) / perGram;
    if (!Number.isFinite(g) || g <= 0) continue;
    const capped = to.portionMaxG != null
      ? Math.min(g, fromNativeGrams(to, to.portionMaxG, toCooked))
      : g;
    // Arrondi au morceau réaliste : proposer « 37 g de banane » reviendrait à en couper
    // un tiers et jeter le reste. L'équivalence macro cède le pas au bon sens.
    return quantizeGrams(to, Math.max(1, capped), toCooked);
  }
  return quantizeGrams(to, Math.max(1, grams), toCooked);
}

/**
 * Unité de saisie à retenir pour l'aliment de remplacement. On conserve celle de
 * l'original quand l'aliment sait se convertir (du poulet pesé cuit devient de la dinde
 * pesée cuite) ; sinon on retombe sur son état natif, seul non ambigu.
 */
export function swapCookedFlag(to: Food, fromCooked: boolean): boolean {
  return to.cookedFactor != null ? fromCooked : to.state === 'cooked';
}

export interface SwapCandidate {
  food: Food;
  /** Grammage équivalent, déjà arrondi à un morceau réaliste. */
  grams: number;
  cooked: boolean;
  /** Déjà dans la sélection de l'utilisateur ? Sinon, l'accepter l'y ajoutera. */
  allowed: boolean;
  /** « 2 bananes », « ½ boîte égouttée »… null pour un aliment qui se pèse librement. */
  pieces: string | null;
}

/**
 * Alternatives proposées pour un aliment du menu : tous les aliments du MÊME RÔLE, avec
 * leur grammage équivalent. Les aliments déjà sélectionnés viennent en premier, puis les
 * autres (choisir l'un d'eux l'ajoutera à la diète). À l'intérieur de chaque groupe, du
 * profil macro le plus proche au plus lointain : les premiers changent le moins la
 * journée. Le rôle « autre » n'a pas d'alternative pertinente → liste vide.
 */
export function swapCandidates(
  from: Food, grams: number, fromCooked: boolean,
  allFoods: Food[], allowedIds: Set<string>
): SwapCandidate[] {
  const role = foodRole(from);
  if (role === 'other') return [];

  const distance = (f: Food) => Math.sqrt(
    (f.proteinPer100g - from.proteinPer100g) ** 2 +
    (f.carbsPer100g - from.carbsPer100g) ** 2 +
    (f.fatPer100g - from.fatPer100g) ** 2
  );

  return allFoods
    .filter((f) => f.id !== from.id && foodRole(f) === role)
    .map((food) => {
      const cooked = swapCookedFlag(food, fromCooked);
      const g = equivalentGrams(from, grams, fromCooked, food, cooked);
      return {
        food,
        cooked,
        grams: g,
        allowed: allowedIds.has(food.id),
        pieces: portionLabel(food, g, cooked)
      };
    })
    .sort((a, b) =>
      (a.allowed === b.allowed ? 0 : a.allowed ? -1 : 1) || distance(a.food) - distance(b.food)
    );
}

/**
 * Applique des remplacements durables (`foodSwaps`, original → remplacement) à un plan.
 * Le grammage est recalculé en équivalent macro ; le solveur re-normalise ensuite les
 * groupes, mais partir d'un grammage juste évite de déformer la journée avant le calcul.
 * Une entrée dont l'un des deux aliments n'existe plus est ignorée (sécurité : un
 * aliment supprimé ne doit pas trouer le menu).
 */
export function applyFoodSwaps(
  plan: Record<string, PlanTemplateMeal[]>,
  swaps: Record<string, string> | undefined,
  foodById: (id: string) => Food | undefined
): Record<string, PlanTemplateMeal[]> {
  if (!swaps || Object.keys(swaps).length === 0) return plan;

  const out: Record<string, PlanTemplateMeal[]> = {};
  for (const [day, meals] of Object.entries(plan)) {
    out[day] = meals.map((m) => ({
      slot: m.slot,
      // Un remplacement peut retomber sur un aliment déjà présent dans le repas : on fusionne
      // pour ne jamais produire deux lignes du même aliment (elles se cocheraient ensemble).
      items: mergeMealItems(m.items.map((it) => {
        const toId = swaps[it.foodId];
        if (!toId || toId === it.foodId) return it;
        const from = foodById(it.foodId);
        const to = foodById(toId);
        if (!from || !to) return it;
        const cooked = swapCookedFlag(to, it.cooked);
        return { foodId: toId, grams: equivalentGrams(from, it.grams, it.cooked, to, cooked), cooked };
      }))
    }));
  }
  return out;
}

/**
 * Remplacement ponctuel dans le plan d'UNE journée (un seul repas concerné). Sert au
 * « juste aujourd'hui » : on écrit le résultat dans le plan figé de la date, sans
 * toucher à la rotation.
 */
export function swapInDayPlan(
  plan: PlanTemplateMeal[],
  slot: PlanTemplateMeal['slot'],
  fromFoodId: string,
  to: Food,
  foodById: (id: string) => Food | undefined
): PlanTemplateMeal[] {
  return plan.map((m) => {
    if (m.slot !== slot) return m;
    return {
      slot: m.slot,
      // Fusion si le remplacement retombe sur un aliment déjà au menu de ce repas : une seule
      // ligne par aliment, sinon les deux se cocheraient ensemble (cf. mergeMealItems).
      items: mergeMealItems(m.items.map((it) => {
        if (it.foodId !== fromFoodId) return it;
        const from = foodById(it.foodId);
        if (!from) return it;
        const cooked = swapCookedFlag(to, it.cooked);
        return { foodId: to.id, grams: equivalentGrams(from, it.grams, it.cooked, to, cooked), cooked };
      }))
    };
  });
}
