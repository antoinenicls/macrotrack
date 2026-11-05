import type { AddonFood, PlanTemplateMeal } from '@/types';
import { MEAL_SLOTS } from '@/types';

/* =========================================================================
 *  Ingrédients d'APPOINT (crème de riz pré-training, etc.).
 *
 *  Un ingrédient d'appoint est un aliment OCCASIONNEL, muni d'un interrupteur
 *  « j'en ai / j'en ai pas » (`available`). Les disponibles sont injectés dans
 *  leur créneau AVANT le calibrage macro (scaleRotationToTargets) : ils entrent
 *  ainsi dans le budget calorique du jour, et le reste du plan se re-échelonne
 *  pour tenir la cible. Le jour où l'on n'en a pas, l'aliment n'est pas injecté :
 *  il disparaît du plan (rien à cocher) et les autres aliments absorbent ses
 *  calories au rescale.
 *
 *  Contrairement à la rotation curée, un ingrédient d'appoint n'est JAMAIS
 *  substitué par un autre du même rôle : il est là ou il n'y est pas. On l'injecte
 *  donc APRÈS la substitution de sélection, pour qu'il ne soit ni remplacé ni
 *  compté comme un aliment de la rotation. Pur, sans I/O → testable.
 * ========================================================================= */

/**
 * Injecte les ingrédients d'appoint DISPONIBLES dans chaque jour de la rotation, sur leur
 * créneau. Un créneau absent ce jour-là est créé. L'ordre des repas suit MEAL_SLOTS.
 *
 * `isBlocked` (optionnel) : un appoint dont l'aliment est exclu (allergie, profil) ou
 * introuvable est ignoré, pour ne pas faire rentrer un aliment interdit par cette porte.
 */
export function injectAddonFoods(
  rotation: Record<string, PlanTemplateMeal[]>,
  addons: AddonFood[] | undefined,
  isBlocked?: (foodId: string) => boolean
): Record<string, PlanTemplateMeal[]> {
  const active = (addons ?? []).filter(
    (a) => a.available && a.grams > 0 && !(isBlocked?.(a.foodId) ?? false)
  );
  if (active.length === 0) return rotation;

  const out: Record<string, PlanTemplateMeal[]> = {};
  for (const [day, meals] of Object.entries(rotation)) {
    const bySlot = new Map<PlanTemplateMeal['slot'], PlanTemplateMeal>(
      meals.map((m) => [m.slot, { slot: m.slot, items: [...m.items] }])
    );
    for (const a of active) {
      const meal = bySlot.get(a.slot);
      const item = { foodId: a.foodId, grams: a.grams, cooked: a.cooked };
      if (meal) meal.items.push(item);
      else bySlot.set(a.slot, { slot: a.slot, items: [item] });
    }
    // Réordonne les repas selon l'ordre canonique (un créneau créé ne finit pas en dernier).
    out[day] = MEAL_SLOTS.filter((s) => bySlot.has(s)).map((s) => bySlot.get(s)!);
  }
  return out;
}
