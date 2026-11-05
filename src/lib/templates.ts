import { getISODay } from 'date-fns';
import { parseDayKey } from './dates';
import type { PlanTemplateMeal } from '@/types';
import type { FullSettings } from '@/services/repositories/settingsRepo';

/**
 * Fusionne les items d'un repas qui pointent le MÊME aliment en une seule ligne (grammages
 * additionnés). Le suivi des portions cochées ne stocke qu'UN état par foodId (cf.
 * logStore.setTemplatePortion) : deux lignes du même aliment se cocheraient donc ensemble et
 * partageraient le même « reste ». Un remplacement qui retombe sur un aliment déjà au menu
 * (« beurre de cacahuète » → huile d'olive alors qu'il y a déjà de l'huile d'olive) crée ce
 * doublon. On garantit ici une ligne par aliment, ce qui rend chaque coche indépendante.
 *
 * Le cuit/cru retenu est celui de la première occurrence : dans le seul cas qui produit un
 * doublon (deux fois le même aliment, même état), les deux coïncident.
 */
export function mergeMealItems(
  items: Array<{ foodId: string; grams: number; cooked: boolean }>
): Array<{ foodId: string; grams: number; cooked: boolean }> {
  const byFood = new Map<string, { foodId: string; grams: number; cooked: boolean }>();
  for (const it of items) {
    const prev = byFood.get(it.foodId);
    if (prev) prev.grams = Math.round((prev.grams + it.grams) * 10) / 10;
    else byFood.set(it.foodId, { ...it });
  }
  return [...byFood.values()];
}

/** Applique {@link mergeMealItems} à chaque repas d'un plan. */
export function mergePlanItems(plan: PlanTemplateMeal[]): PlanTemplateMeal[] {
  return plan.map((m) => ({ slot: m.slot, items: mergeMealItems(m.items) }));
}

/**
 * Retourne le plan type à utiliser pour une date donnée.
 *  - Si l'utilisateur a configuré un plan spécifique pour ce jour de la semaine
 *    (settings.weeklyTemplates["1".."7"], 1=lundi), on l'utilise.
 *  - Sinon on retombe sur le `planTemplate` commun.
 *
 * ISO weekday : 1=lundi, 7=dimanche (cohérent avec getISODay).
 *
 * Le résultat est toujours dédoublonné par aliment (cf. mergeMealItems) : même un plan
 * figé plus ancien qui contiendrait un doublon rend une ligne cochable par aliment.
 */
export function getTemplateForDate(dateKey: string, settings: FullSettings): PlanTemplateMeal[] {
  // Plan figé pour cette date précise : une fois la journée entamée, son plan ne doit
  // plus bouger même si le coach ré-ajuste la cible (cf. AppSettings.planSnapshots).
  const frozen = settings.planSnapshots?.[dateKey];
  if (frozen && frozen.length > 0) return mergePlanItems(frozen);
  const day = String(getISODay(parseDayKey(dateKey)));
  const weekly = settings.weeklyTemplates?.[day];
  return mergePlanItems(weekly && weekly.length > 0 ? weekly : settings.planTemplate);
}

/** Vrai si un plan spécifique est configuré pour ce jour. */
export function hasCustomTemplateForWeekday(weekday: number, settings: FullSettings): boolean {
  const t = settings.weeklyTemplates?.[String(weekday)];
  return !!(t && t.length > 0);
}

export const WEEKDAY_LABEL: Record<number, string> = {
  1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim'
};

export const WEEKDAY_LABEL_LONG: Record<number, string> = {
  1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche'
};
