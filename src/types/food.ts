export type FoodCategory =
  | 'proteine'
  | 'glucide'
  | 'lipide'
  | 'legume'
  | 'fruit'
  | 'autre';

/**
 * Micronutriments suivis par la couverture hebdomadaire. Liste volontairement COURTE :
 * ce sont les apports qu'une diète de sèche rate le plus facilement quand on retire des
 * aliments, et qu'on peut vérifier honnêtement à partir des seules quantités du plan.
 * `omega3` désigne les EPA/DHA (poissons gras) : l'ALA des noix ne les remplace pas,
 * la conversion étant marginale, donc les oléagineux ne portent pas ce marqueur.
 */
export type Nutrient =
  | 'omega3'
  | 'fer'
  | 'calcium'
  | 'folates'
  | 'vitamineC'
  | 'b12'
  | 'fibres';

/**
 * Étiquettes de composition, base des profils alimentaires et des allergies.
 * Descriptives, jamais normatives : `lacte` dit que l'aliment contient du lait, pas qu'il
 * est bon ou mauvais. C'est l'utilisateur qui décide de ce qu'il exclut (cf. lib/diet).
 */
export type FoodTag =
  | 'viande'
  | 'poisson'
  | 'lacte'
  | 'oeuf'
  | 'gluten'
  | 'fruits-a-coque'
  | 'arachide';

/** Portion "concrète" parlante pour le débutant. Ex: { label: "1 œuf moyen", grams: 50 } */
export interface FoodServing {
  label: string;
  /** Équivalent en grammes, exprimé dans le `state` natif de l'aliment (cru/sec ou cuit). */
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  /** Macros pour 100g, état indiqué par `state` (cru/sec par défaut sauf mention) */
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  category: FoodCategory;
  /** Si vrai, créé par l'utilisateur (donc supprimable). */
  isCustom: boolean;
  /** État de référence des macros : "raw" (cru/sec) ou "cooked" (cuit). */
  state: 'raw' | 'cooked';
  /** Facteur de rendement cru→cuit (poids cuit / poids cru). Ex: riz ≈ 2.5, viande ≈ 0.7. */
  cookedFactor?: number;
  /** Portions courantes (1 œuf, 1 banane, 1 c.à.s, …) — affichées pour faciliter la saisie. */
  commonServings?: FoodServing[];
  /**
   * Portion MAXIMALE plausible en une journée, exprimée dans le `state` natif de
   * l'aliment (cru/sec ou cuit). Sert de garde-fou au solveur de portions : sans elle,
   * une sélection d'aliments pauvre peut produire des quantités absurdes (900 g de
   * pommes de terre, 400 g de flocons) parce qu'un seul aliment absorbe tout l'écart
   * calorique. Le solveur plafonne l'aliment à cette valeur et redistribue le reste sur
   * les autres. Absent = aucun plafond (comportement historique).
   */
  portionMaxG?: number;
  /**
   * Plus petit MORCEAU réaliste, dans l'état natif de l'aliment. Certains aliments se
   * mangent par pièces : une banane, un œuf, une boîte de thon, un carré de chocolat.
   * Proposer « 37 g de banane » n'a aucun sens, ça revient à couper un tiers de banane et
   * jeter le reste. Les quantités de ces aliments sont donc arrondies à un multiple de ce
   * pas (moitiés autorisées quand couper en deux est naturel : banane, pomme, boîte).
   * Absent = aliment qui se pèse librement (riz, viande, fromage blanc), aucun arrondi.
   */
  portionStepG?: number;
  /**
   * Micronutriments dont cet aliment est une source NOTABLE (cf. lib/coverage). Sert au
   * bilan de couverture hebdomadaire : sans ça, remplacer les sardines par du poulet
   * garde les macros parfaites et supprime les oméga-3 en silence. Un aliment créé par
   * l'utilisateur peut porter ses propres marqueurs.
   */
  nutrients?: Nutrient[];
  /**
   * Composition de l'aliment (viande, gluten, lacté…). Sert aux profils alimentaires et
   * aux exclusions strictes : un aliment portant une étiquette exclue ne peut ni entrer
   * dans le plan, ni être proposé en remplacement, ni être suggéré par le bilan de
   * couverture. Un aliment sans étiquette n'est jamais exclu par un profil.
   */
  tags?: FoodTag[];
  createdAt: number;
}

export interface Combo {
  id: string;
  name: string;
  items: Array<{ foodId: string; grams: number; cooked?: boolean }>;
  createdAt: number;
}
