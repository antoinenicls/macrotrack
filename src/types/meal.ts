export type MealSlot = 'petit-dej' | 'dejeuner' | 'diner' | 'collation';

export const MEAL_SLOTS: MealSlot[] = ['petit-dej', 'dejeuner', 'diner', 'collation'];

export const MEAL_LABEL: Record<MealSlot, string> = {
  'petit-dej': 'Petit-déjeuner',
  'dejeuner': 'Déjeuner',
  'diner': 'Dîner',
  'collation': 'Collation'
};

/**
 * Catégories de repas pris à l'extérieur (estimation, pas de pesée possible).
 * Adaptées au moment de la journée : petit-déj (pdej-*), déj/dîner (main-*), collation (snack-*).
 */
export type EatenOutCategory =
  // Forfaits génériques (les premiers proposés, gardés pour l'historique).
  | 'pdej-leger' | 'pdej-classique' | 'pdej-brunch' | 'pdej-sucre'
  | 'main-leger' | 'main-equilibre' | 'main-copieux' | 'main-fastfood'
  | 'snack-leger' | 'snack-equilibre' | 'snack-gourmand' | 'snack-ecart'
  // Plats précis : plus juste qu'un forfait quand on sait ce qu'on a mangé.
  | 'pdej-croissant' | 'pdej-pain-choc' | 'pdej-tartines' | 'pdej-cereales' | 'pdej-oeufs-pain'
  | 'pdej-pancakes' | 'pdej-avocado-toast' | 'pdej-granola'
  | 'main-pizza' | 'main-burger-frites' | 'main-kebab' | 'main-tacos' | 'main-sushi' | 'main-poke'
  | 'main-pates' | 'main-asiatique' | 'main-salade' | 'main-sandwich' | 'main-steak-frites'
  | 'main-couscous' | 'main-galette' | 'main-quiche' | 'main-cantine' | 'main-raclette'
  | 'snack-fruit' | 'snack-barre-prot' | 'snack-skyr-fruit' | 'snack-oleagineux' | 'snack-cookie'
  | 'snack-patisserie' | 'snack-glace' | 'snack-chips' | 'snack-barre-choco' | 'snack-viennoiserie';

/** Suppléments d'un repas estimé (boissons, dessert, pain…), comptés à l'unité. */
export type EatenOutExtra =
  | 'soda' | 'biere' | 'vin' | 'cocktail' | 'latte'
  | 'pain' | 'frites' | 'sauce' | 'fromage' | 'entree' | 'dessert';

/**
 * Décompte de portions « à la main » (méthode des portions Precision Nutrition) :
 * une estimation sans balance, par gestes (paume = protéine, poignée = féculent,
 * pouce = matière grasse, poignée verte = légumes). Permet des demi-portions.
 */
export interface HandPortions {
  protein: number;
  carbs: number;
  fat: number;
  veg: number;
}

/**
 * Estimation d'un repas non pesé (extérieur OU fait par quelqu'un d'autre). On stocke
 * un SNAPSHOT des macros au moment du log : ainsi un ajustement futur des presets ou
 * des barèmes ne réécrit pas l'historique.
 *
 * Deux méthodes :
 *  - `category` : un preset rond choisi par créneau (rapide, grossier).
 *  - `hand`     : décompte de portions à la main (plus précis, compose l'assiette).
 * `method` absent ⇒ ancien snapshot par catégorie (rétro-compat).
 */
export interface MealEstimate {
  method?: 'category' | 'hand';
  /** Méthode 'category' uniquement. */
  category?: EatenOutCategory;
  /** Méthode 'hand' uniquement : le décompte saisi (pour ré-édition). */
  portions?: HandPortions;
  /** Méthode 'category' : taille de la portion (multiplicateur, 1 = normale). */
  size?: number;
  /** Suppléments comptés en plus (les deux méthodes), pour ré-édition. */
  extras?: Partial<Record<EatenOutExtra, number>>;
  /**
   * Repas pas encore entamés quand l'estimation a été saisie : le reste de la journée se
   * recale sur eux (cf. lib/estimateRebalance). Figé à la 1ʳᵉ saisie pour que cocher un
   * aliment ensuite ne fasse pas bouger les autres portions.
   */
  rebalanceSlots?: MealSlot[];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealItem {
  foodId: string;
  /** Quantité saisie (en grammes), interprétée selon `cooked`. */
  grams: number;
  /** Si vrai, la quantité est en cuit ; sinon en cru/sec. */
  cooked: boolean;
  /** Marqueur "issu du plan type" pour la fonctionnalité "cocher le plan". */
  fromTemplate?: boolean;
  /**
   * Si présent, l'item est un repas pris à l'EXTÉRIEUR (resto, fast-food) : les macros
   * proviennent de cette estimation, pas d'un aliment pesé. `foodId` vaut alors un
   * sentinel (EATEN_OUT_FOOD_ID). Garde le suivi de la journée sans pesée précise.
   */
  estimate?: MealEstimate;
}

export interface Meal {
  id: string;
  /** Date locale YYYY-MM-DD */
  date: string;
  slot: MealSlot;
  items: MealItem[];
  createdAt: number;
}

/** Plan type : configuration utilisateur, pas un Meal réel. */
export interface PlanTemplateMeal {
  slot: MealSlot;
  items: Array<{ foodId: string; grams: number; cooked: boolean }>;
}
