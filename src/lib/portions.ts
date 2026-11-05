import type { Food } from '@/types';
import { toNativeGrams, fromNativeGrams } from './nutrition';
import { describeServing } from './format';

/* =========================================================================
 *  Portions réalistes.
 *
 *  Un solveur de macros raisonne en grammes continus, la vie non. « Remplace
 *  ton kiwi par 37 g de banane » veut dire couper un tiers de banane et jeter
 *  le reste : personne ne fait ça. Les aliments qui se mangent par pièces
 *  portent un `portionStepG` (le plus petit morceau réaliste) et toutes les
 *  quantités proposées sont arrondies à un multiple de ce pas, avec un minimum
 *  d'un morceau.
 *
 *  Ce module ne connaît que la géométrie des portions : il ne décide pas des
 *  macros. Le solveur, lui, épingle ces quantités arrondies et laisse les
 *  aliments qui se pèsent librement (riz, viande) absorber la différence.
 *  Pur, sans I/O → testable.
 * ========================================================================= */

/** Ce dont ce module a besoin : marche pour un aliment seed comme perso. */
export type PortionFood = Pick<Food, 'state' | 'cookedFactor' | 'portionStepG' | 'commonServings'>;

/** L'aliment se mange-t-il par pièces (banane, œuf, boîte) plutôt qu'au poids ? */
export function isDiscrete(food: PortionFood | undefined): boolean {
  return !!food?.portionStepG && food.portionStepG > 0;
}

/**
 * Arrondit une quantité au morceau réaliste le plus proche, dans l'unité de saisie
 * demandée. Jamais moins d'un morceau : si l'équivalence macro réclame 10 g de banane,
 * la réponse honnête est « une demi-banane », pas « 10 g ».
 * Aliment qui se pèse librement → quantité rendue telle quelle (arrondie au gramme).
 */
export function quantizeGrams(food: PortionFood | undefined, grams: number, cooked: boolean): number {
  const step = food?.portionStepG;
  if (!food || !step || step <= 0) return Math.max(1, Math.round(grams));

  const native = toNativeGrams(food, grams, cooked);
  const steps = Math.max(1, Math.round(native / step));
  return Math.max(1, Math.round(fromNativeGrams(food, steps * step, cooked)));
}

/**
 * Libellé en pièces d'une quantité (« 2 bananes », « ½ boîte égouttée »), ou null si
 * l'aliment se pèse librement ou qu'aucune portion concrète n'est renseignée. Sert à
 * afficher ce qu'on va réellement sortir du frigo plutôt qu'un nombre de grammes.
 */
export function portionLabel(food: PortionFood | undefined, grams: number, cooked: boolean): string | null {
  if (!food || !isDiscrete(food)) return null;
  const serving = food.commonServings?.[0];
  if (!serving) return null;
  return describeServing(toNativeGrams(food, grams, cooked), serving);
}

export interface TemplatePortionState {
  /** Quantité déjà consommée (bornée à ≥ 0). */
  consumed: number;
  /** Portion prévue ATTEINTE (repas validé) : vrai aussi en cas de dépassement. */
  full: boolean;
  /** Mangé PLUS que prévu. */
  over: boolean;
  /** Mangé MOINS que prévu (entamé mais pas fini). */
  partial: boolean;
  /** Reste à manger pour atteindre le prévu (0 si atteint ou dépassé). */
  remaining: number;
  /** Dépassement au-dessus du prévu (0 si sous ou à la cible). */
  excess: number;
}

/**
 * État d'une portion d'un aliment DU PLAN vis-à-vis de la quantité prévue, à partir de la
 * quantité déjà consommée. Tolérance de 0,5 g autour du prévu pour ne pas basculer sur un
 * simple arrondi. Sert à l'affichage du repas : coche vide / entamée (moins) / validée /
 * dépassée (plus). `over` et `partial` sont exclusifs ; `over` implique `full`.
 */
export function templatePortionState(consumedGrams: number, plannedGrams: number): TemplatePortionState {
  const consumed = Math.max(0, consumedGrams);
  const full = consumed > 0 && consumed >= plannedGrams - 0.5;
  const over = consumed > plannedGrams + 0.5;
  const partial = consumed > 0 && consumed < plannedGrams - 0.5;
  return {
    consumed,
    full,
    over,
    partial,
    remaining: Math.max(0, plannedGrams - consumed),
    excess: Math.max(0, Math.round((consumed - plannedGrams) * 10) / 10)
  };
}
