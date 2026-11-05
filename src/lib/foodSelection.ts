import type { Food, PlanTemplateMeal } from '@/types';

/* =========================================================================
 *  Sélection d'aliments + base « obligatoire » (par RÔLE).
 *
 *  L'utilisateur choisit les aliments qu'il accepte de manger. La diète ne
 *  compose alors ses repas QU'À PARTIR de ces aliments : tout aliment de la
 *  rotation curée qui n'est pas autorisé est REMPLACÉ par un aliment autorisé du
 *  MÊME RÔLE (celui au profil macro le plus proche), puis le solveur macro
 *  (scaleRotationToTargets) rescale comme d'habitude.
 *
 *  La contrainte « base » ne verrouille PAS un aliment précis (piège en cas
 *  d'allergie) : elle porte sur le RÔLE. Chaque rôle essentiel (protéine,
 *  féculent, légume, fruit, lipide) doit garder ≥1 aliment autorisé. La base
 *  recommandée n'est qu'une pré-sélection simple et universelle, remplaçable.
 *  Pur, sans I/O → testable.
 * ========================================================================= */

export type FoodRole = 'protein' | 'carb' | 'legume' | 'veg' | 'fruit' | 'fat' | 'other';

/**
 * Rôles fins qui ne se déduisent pas de la seule catégorie : les légumineuses sont
 * rangées en `glucide` dans la base mais jouent un rôle propre (protéines végétales,
 * fibres, prébiotiques) → on les distingue pour la substitution et la couverture.
 */
const ROLE_OVERRIDE: Record<string, FoodRole> = {
  'lentilles-seches': 'legume',
  'haricots-rouges': 'legume',
  'pois-chiches': 'legume'
};

/** Rôle d'un aliment, dérivé de sa catégorie (+ overrides légumineuses). */
export function foodRole(food: Pick<Food, 'id' | 'category'>): FoodRole {
  const override = ROLE_OVERRIDE[food.id];
  if (override) return override;
  switch (food.category) {
    case 'proteine': return 'protein';
    case 'glucide': return 'carb';
    case 'fruit': return 'fruit';
    case 'lipide': return 'fat';
    case 'legume': return 'veg';
    default: return 'other';
  }
}

export const ROLE_LABEL: Record<FoodRole, string> = {
  protein: 'Protéines',
  carb: 'Féculents',
  legume: 'Légumineuses',
  veg: 'Légumes',
  fruit: 'Fruits',
  fat: 'Lipides',
  other: 'Autres'
};

/**
 * Base recommandée : un aliment simple et universel par rôle essentiel, pré-coché mais
 * REMPLAÇABLE. Socle « mangeable par tout le monde, facile à mettre en place » — la
 * sélection de l'utilisateur vient s'y ajouter.
 */
export const BASE_FOOD_IDS: readonly string[] = [
  'oeuf-entier',      // protéine
  'riz-complet-sec',  // féculent complet
  'lentilles-seches', // légumineuse
  'haricots-verts',   // légume vert
  'banane',           // fruit
  'pomme',            // fruit
  'huile-olive'       // lipide
];

/**
 * Rôles dont la diète a besoin d'AU MOINS un aliment autorisé pour rester complète.
 * (Les légumineuses sont recommandées mais pas strictement obligatoires — protéines +
 * féculents + légumes + fruits + lipides suffisent à une diète équilibrée.)
 */
export const ESSENTIAL_ROLES: readonly FoodRole[] = ['protein', 'carb', 'veg', 'fruit', 'fat'];

/** Rôles couverts par un ensemble d'aliments autorisés. */
export function coveredRoles(allowedIds: Iterable<string>, foodById: (id: string) => Food | undefined): Set<FoodRole> {
  const set = new Set<FoodRole>();
  for (const id of allowedIds) {
    const f = foodById(id);
    if (f) set.add(foodRole(f));
  }
  return set;
}

/** Rôles essentiels NON couverts (→ à signaler : la diète ne peut pas se composer). */
export function missingEssentialRoles(allowedIds: Iterable<string>, foodById: (id: string) => Food | undefined): FoodRole[] {
  const covered = coveredRoles(allowedIds, foodById);
  return ESSENTIAL_ROLES.filter((r) => !covered.has(r));
}

/**
 * Ensemble d'aliments autorisés EFFECTIF. `selectedFoodIds` absent → TOUS les aliments
 * (comportement historique : la rotation curée reste intacte tant que l'utilisateur n'a
 * rien personnalisé).
 */
export function effectiveAllowedIds(selectedFoodIds: string[] | undefined, allFoodIds: string[]): Set<string> {
  return new Set(selectedFoodIds ?? allFoodIds);
}

/** Distance entre profils macro (P,C,L /100g), en g/100g. */
function macroDistance(a: Food, b: Food): number {
  return Math.sqrt(
    (a.proteinPer100g - b.proteinPer100g) ** 2 +
    (a.carbsPer100g - b.carbsPer100g) ** 2 +
    (a.fatPer100g - b.fatPer100g) ** 2
  );
}

/**
 * Candidats COMPARABLES à l'original, triés du plus proche au plus lointain. On ne garde
 * que ceux qui restent dans une bande de tolérance autour du meilleur : varier ne doit
 * jamais justifier un substitut au profil macro aberrant (du beurre de cacahuète à la
 * place du poulet). Avec un seul candidat plausible, la bande n'en contient qu'un.
 */
function comparableCandidates(orig: Food, candidates: Food[]): Food[] {
  const scored = candidates
    .map((c) => ({ c, d: macroDistance(c, orig) }))
    .sort((a, b) => a.d - b.d);
  const limit = scored[0].d * 1.5 + 4;
  return scored.filter((s) => s.d <= limit).map((s) => s.c);
}

/** Pénalité d'un substitut déjà servi LE MÊME JOUR, relative à une répétition dans la semaine. */
const SAME_DAY_WEIGHT = 10;

/**
 * Remplace, dans la rotation, tout aliment NON autorisé par un aliment autorisé du même
 * rôle. Grammage et état cru/cuit conservés : le solveur macro (scaleRotationToTargets)
 * rescale ensuite chaque GROUPE pour retomber sur les cibles.
 *  - aliment déjà autorisé → gardé tel quel (préserve le plan curé) ;
 *  - rôle « other » ou rôle non couvert par la sélection → gardé (repli sûr, jamais de trou).
 *
 * Le choix du substitut n'est PAS le simple plus proche : ce serait toujours le même
 * aliment, et une sélection étroite produirait du poulet vingt fois dans la semaine.
 * On retient les candidats comparables (bande de tolérance macro autour du meilleur), et
 * parmi eux le MOINS déjà servi, une répétition dans la même journée pesant bien plus
 * qu'une répétition dans la semaine. Les aliments déjà présents et autorisés sont
 * comptés d'emblée : un substitut ne vient pas s'empiler sur un aliment déjà au menu.
 * À égalité d'usage, le plus proche l'emporte (l'ordre de la bande est conservé), donc
 * le résultat reste déterministe.
 */
export function substituteRotationToAllowed(
  rotation: Record<string, PlanTemplateMeal[]>,
  allowedIds: Set<string>,
  foodById: (id: string) => Food | undefined,
  /**
   * Aliments INTERDITS (allergie, profil). Le repli « aucun candidat → on garde
   * l'original » est sûr pour un simple « pas envie », mais pas pour une allergie : il
   * laisserait l'aliment interdit dans l'assiette. Un aliment interdit sans substitut est
   * donc RETIRÉ du repas. Une assiette incomplète se rattrape (le bilan de couverture et
   * l'écart de macros le signalent) ; un allergène servi, non.
   */
  isForbidden?: (food: Food) => boolean
): Record<string, PlanTemplateMeal[]> {
  // Aliments autorisés indexés par rôle (candidats de substitution).
  const allowedByRole = new Map<FoodRole, Food[]>();
  for (const id of allowedIds) {
    const f = foodById(id);
    if (!f) continue;
    const r = foodRole(f);
    const arr = allowedByRole.get(r);
    if (arr) arr.push(f);
    else allowedByRole.set(r, [f]);
  }

  // Usage de départ : ce que la rotation sert DÉJÀ et qui est autorisé.
  const weekUse = new Map<string, number>();
  const dayUse = new Map<string, Map<string, number>>();
  for (const [day, meals] of Object.entries(rotation)) {
    const du = new Map<string, number>();
    for (const m of meals) for (const it of m.items) {
      if (!allowedIds.has(it.foodId)) continue;
      du.set(it.foodId, (du.get(it.foodId) ?? 0) + 1);
      weekUse.set(it.foodId, (weekUse.get(it.foodId) ?? 0) + 1);
    }
    dayUse.set(day, du);
  }

  /** `null` = l'item doit disparaître du repas. */
  const substitute = (
    it: PlanTemplateMeal['items'][number],
    du: Map<string, number>
  ): PlanTemplateMeal['items'][number] | null => {
    if (allowedIds.has(it.foodId)) return it;
    const orig = foodById(it.foodId);
    if (!orig) return it;
    const forbidden = isForbidden?.(orig) ?? false;
    const role = foodRole(orig);
    if (role === 'other') return forbidden ? null : it;
    const candidates = allowedByRole.get(role);
    if (!candidates || candidates.length === 0) {
      // Rôle non couvert : on garde l'original (repli sûr), SAUF s'il est interdit.
      return forbidden ? null : it;
    }

    const band = comparableCandidates(orig, candidates);
    let pick = band[0];
    let bestCost = Infinity;
    for (const c of band) {
      const cost = (du.get(c.id) ?? 0) * SAME_DAY_WEIGHT + (weekUse.get(c.id) ?? 0);
      if (cost < bestCost) { bestCost = cost; pick = c; }
    }
    du.set(pick.id, (du.get(pick.id) ?? 0) + 1);
    weekUse.set(pick.id, (weekUse.get(pick.id) ?? 0) + 1);
    return { ...it, foodId: pick.id };
  };

  const out: Record<string, PlanTemplateMeal[]> = {};
  for (const [day, meals] of Object.entries(rotation)) {
    const du = dayUse.get(day)!;
    out[day] = meals.map((m) => ({
      slot: m.slot,
      items: m.items
        .map((it) => substitute(it, du))
        .filter((it): it is PlanTemplateMeal['items'][number] => it !== null)
    }));
  }
  return out;
}
