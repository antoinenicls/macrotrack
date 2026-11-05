import type { Food, FoodTag } from '@/types';

/* =========================================================================
 *  Profils alimentaires et exclusions strictes.
 *
 *  Deux niveaux, volontairement distincts :
 *   - la SÉLECTION (`selectedFoodIds`) dit ce qu'on a envie de manger. Elle se
 *     coche, se décoche, et le moteur peut proposer autre chose ;
 *   - les EXCLUSIONS (`excludedTags`) disent ce qu'on ne peut pas manger. Elles
 *     sont strictes : rien ne les contourne, ni une substitution automatique, ni
 *     un remplacement proposé, ni une suggestion du bilan de couverture. C'est la
 *     différence entre « je n'aime pas » et « je suis allergique », et confondre
 *     les deux serait dangereux.
 *
 *  Un profil (végétarien, sans gluten…) n'est qu'un raccourci vers un jeu
 *  d'exclusions : il n'existe pas comme état séparé, ce qui évite qu'un profil et
 *  des exclusions manuelles se contredisent.
 *  Pur, sans I/O → testable.
 * ========================================================================= */

export const TAG_LABEL: Record<FoodTag, string> = {
  viande: 'Viande',
  poisson: 'Poisson',
  lacte: 'Produits laitiers',
  oeuf: 'Œufs',
  gluten: 'Gluten',
  'fruits-a-coque': 'Fruits à coque',
  arachide: 'Arachide'
};

/** Ordre d'affichage des exclusions (régime d'abord, allergènes ensuite). */
export const TAG_ORDER: readonly FoodTag[] = [
  'viande', 'poisson', 'oeuf', 'lacte', 'gluten', 'fruits-a-coque', 'arachide'
];

export interface DietPreset {
  id: string;
  label: string;
  /** Étiquettes exclues par ce profil. */
  tags: readonly FoodTag[];
  hint: string;
}

/**
 * Raccourcis courants. Cocher un profil pose exactement ses exclusions ; l'utilisateur
 * reste libre d'en ajouter ou d'en retirer ensuite, auquel cas plus aucun profil n'est
 * « actif » et c'est la liste d'exclusions qui fait foi.
 */
export const DIET_PRESETS: readonly DietPreset[] = [
  {
    id: 'omnivore', label: 'Tout', tags: [],
    hint: 'Aucune exclusion.'
  },
  {
    id: 'pescetarien', label: 'Pescétarien', tags: ['viande'],
    hint: 'Poisson et œufs gardés, viande écartée.'
  },
  {
    id: 'vegetarien', label: 'Végétarien', tags: ['viande', 'poisson'],
    hint: 'Œufs et produits laitiers gardés.'
  },
  {
    id: 'vegetalien', label: 'Végétalien', tags: ['viande', 'poisson', 'oeuf', 'lacte'],
    hint: 'Aucun produit animal. La B12 devra venir d\'un supplément.'
  }
];

/** Étiquettes qui relèvent d'une allergie ou d'une intolérance plutôt que d'un choix. */
export const ALLERGEN_TAGS: readonly FoodTag[] = ['gluten', 'lacte', 'oeuf', 'fruits-a-coque', 'arachide'];

/** Profil correspondant EXACTEMENT aux exclusions posées, s'il y en a un. */
export function matchingPreset(excluded: readonly FoodTag[] | undefined): DietPreset | undefined {
  const set = new Set(excluded ?? []);
  return DIET_PRESETS.find(
    (p) => p.tags.length === set.size && p.tags.every((t) => set.has(t))
  );
}

/** L'aliment porte-t-il une étiquette exclue ? */
export function isExcluded(food: Pick<Food, 'tags'> | undefined, excluded: readonly FoodTag[] | undefined): boolean {
  if (!food?.tags || !excluded || excluded.length === 0) return false;
  return food.tags.some((t) => excluded.includes(t));
}

/** Étiquettes exclues portées par un aliment (pour dire POURQUOI il est écarté). */
export function excludedReasons(food: Pick<Food, 'tags'> | undefined, excluded: readonly FoodTag[] | undefined): FoodTag[] {
  if (!food?.tags || !excluded) return [];
  return food.tags.filter((t) => excluded.includes(t));
}

/**
 * Ensemble d'aliments réellement utilisables : la sélection de l'utilisateur, PRIVÉE de
 * tout ce que ses exclusions interdisent. C'est le seul ensemble que doivent consulter le
 * moteur de plan, les remplacements et les suggestions de couverture : passer par la
 * sélection brute laisserait une allergie revenir par une substitution automatique.
 * `selectedFoodIds` absent = tous les aliments (comportement historique), exclusions
 * appliquées quand même.
 */
export function usableFoodIds(
  selectedFoodIds: string[] | undefined,
  excludedTags: FoodTag[] | undefined,
  foods: Food[]
): Set<string> {
  const selected = selectedFoodIds ? new Set(selectedFoodIds) : null;
  const out = new Set<string>();
  for (const f of foods) {
    if (selected && !selected.has(f.id)) continue;
    if (isExcluded(f, excludedTags)) continue;
    out.add(f.id);
  }
  return out;
}
