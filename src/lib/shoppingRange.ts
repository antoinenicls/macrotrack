/* =========================================================================
 *  Liste de courses « ce qu'il reste » : courses de réassort en milieu de semaine.
 *
 *  Au lieu du total lundi → dimanche, la liste ne compte que les jours à partir d'une
 *  date choisie (par défaut demain) : ce qu'on va encore manger d'ici dimanche. Le stock
 *  « déjà à la maison » s'en déduit, ce qui donne la vraie quantité à racheter.
 *  Dates au format `YYYY-MM-DD` (comparables en chaîne). Pur, sans I/O.
 * ========================================================================= */

/**
 * Jours de départ possibles : aujourd'hui puis les jours suivants de la semaine affichée.
 * Vide si aujourd'hui n'est pas dans cette semaine (le week-end, la liste prépare déjà la
 * semaine suivante en entier) ou si c'est le dernier jour (plus rien à découper).
 */
export function remainingStartOptions(weekDates: string[], today: string): string[] {
  if (!weekDates.includes(today)) return [];
  const opts = weekDates.filter((d) => d >= today);
  return opts.length > 1 ? opts : [];
}

/** Départ par défaut : demain (on fait ses courses pour la suite), sinon aujourd'hui. */
export function defaultRemainingStart(options: string[], today: string): string | null {
  return options.find((d) => d > today) ?? options[0] ?? null;
}

/** Départ mémorisé encore valable (un jour passé n'a plus de sens), sinon null. */
export function validRemainingStart(saved: string | null, options: string[]): string | null {
  return saved && options.includes(saved) ? saved : null;
}

/**
 * Séances encore à prévoir sur la période : l'objectif de la semaine moins celles déjà
 * comptées (avant la période, ou déclarées dans un jour de la période), au plus une par
 * jour restant.
 */
export function sessionsLeftInRange(
  perWeek: number,
  countedBefore: number,
  countedInRange: number,
  daysInRange: number
): number {
  const left = Math.max(0, Math.round(perWeek) - countedBefore - countedInRange);
  return Math.min(left, Math.max(0, daysInRange - countedInRange));
}
