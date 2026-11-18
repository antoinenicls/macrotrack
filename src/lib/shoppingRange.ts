/* =========================================================================
 *  Liste de courses : jours comptés.
 *
 *  Par défaut, la liste compte toute la semaine. On peut retirer des jours : ceux déjà
 *  passés (courses de réassort en milieu de semaine : seulement ce qu'il reste à manger)
 *  ou ceux hors diète (resto, déplacement). Le stock « déjà à la maison » se déduit du
 *  besoin des jours restants, ce qui donne la vraie quantité à racheter.
 *  Dates au format `YYYY-MM-DD` (comparables en chaîne). Pur, sans I/O.
 * ========================================================================= */

/** Jours retirés mémorisés, limités à la semaine affichée ; jamais tous (liste vide). */
export function sanitizeSkips(saved: unknown, weekDates: string[]): Set<string> {
  if (!Array.isArray(saved)) return new Set();
  const skips = new Set(saved.filter((d): d is string => typeof d === 'string' && weekDates.includes(d)));
  return skips.size >= weekDates.length ? new Set() : skips;
}

/** Retire / remet un jour. Refusé (même Set) s'il ne resterait plus aucun jour. */
export function toggleSkip(skips: Set<string>, day: string, weekDates: string[]): Set<string> {
  const next = new Set(skips);
  if (next.has(day)) next.delete(day);
  else next.add(day);
  return next.size >= weekDates.length ? skips : next;
}

/**
 * Courses de réassort : un jour passé (ou aujourd'hui) est retiré. Aujourd'hui, s'il est
 * gardé, compte alors en entier sur le plan type, même déjà entamé.
 */
export function isRestock(skips: Set<string>, today: string): boolean {
  for (const d of skips) if (d <= today) return true;
  return false;
}

/**
 * Séances encore à prévoir sur les jours comptés : l'objectif de la semaine moins celles
 * déjà comptées (dans un jour retiré, ou déclarées dans un jour compté), au plus une par
 * jour compté.
 */
export function sessionsLeftInRange(
  perWeek: number,
  countedOutside: number,
  countedInRange: number,
  daysInRange: number
): number {
  const left = Math.max(0, Math.round(perWeek) - countedOutside - countedInRange);
  return Math.min(left, Math.max(0, daysInRange - countedInRange));
}
