/* =========================================================================
 *  Garde-manger : logique pure de déduction du stock sur la liste de courses.
 *  `besoin` et `stock` sont exprimés dans la même unité (grammes d'achat cru/sec).
 * ========================================================================= */

/** Quantité réellement à acheter = besoin de la semaine moins ce qu'on a déjà. */
export function toBuyGrams(needGrams: number, stockGrams: number | undefined): number {
  return Math.max(0, needGrams - (stockGrams ?? 0));
}

/** Vrai si le stock couvre déjà tout le besoin (rien à racheter). */
export function isFullyStocked(needGrams: number, stockGrams: number | undefined): boolean {
  return needGrams > 0 && (stockGrams ?? 0) >= needGrams;
}
