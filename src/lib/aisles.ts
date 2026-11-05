import type { Food } from '@/types';

/**
 * Rayon de magasin pour trier la liste de courses dans un ordre de parcours logique.
 * La catégorie nutritionnelle ne suffit pas (ex : sardines = "proteine" mais rayon
 * conserves), d'où une correspondance explicite par aliment + un repli par catégorie.
 */
export type Aisle =
  | 'produce'
  | 'boucherie'
  | 'conserves'
  | 'cremerie'
  | 'epicerie-salee'
  | 'gouter'
  | 'complements';

export const AISLE_LABEL: Record<Aisle, string> = {
  'produce':        'Fruits & légumes',
  'boucherie':      'Boucherie',
  'conserves':      'Conserves',
  'cremerie':       'Crémerie & œufs',
  'epicerie-salee': 'Féculents & épicerie salée',
  'gouter':         'Goûter & épicerie sucrée',
  'complements':    'Compléments'
};

/** Ordre de parcours type en magasin (frais d'abord, épicerie ensuite). */
export const AISLE_ORDER: Aisle[] = [
  'produce', 'boucherie', 'conserves', 'cremerie', 'epicerie-salee', 'gouter', 'complements'
];

const BY_ID: Record<string, Aisle> = {
  'banane': 'produce', 'kiwi': 'produce', 'pomme': 'produce', 'fruits-rouges-surgeles': 'produce',
  'pomme-de-terre-cru': 'produce', 'haricots-verts': 'produce', 'asperges-vertes': 'produce',
  'carottes': 'produce', 'poivron-rouge': 'produce', 'tomates': 'produce',
  'courgette': 'produce',
  'poulet-blanc-cru': 'boucherie', 'steak-hache-5-cru': 'boucherie',
  'sardines-boite': 'conserves', 'thon-naturel': 'conserves',
  'whey': 'complements',
  'oeuf-entier': 'cremerie', 'fromage-blanc-0': 'cremerie',
  'riz-blanc-sec': 'epicerie-salee', 'riz-complet-sec': 'epicerie-salee',
  'pates-completes-sec': 'epicerie-salee', 'flocons-avoine': 'epicerie-salee',
  'lentilles-seches': 'epicerie-salee', 'huile-olive': 'epicerie-salee',
  'amandes': 'gouter', 'noix': 'gouter', 'beurre-cacahuete': 'gouter',
  'chocolat-noir-80': 'gouter', 'datte': 'gouter',
  'galettes-riz-complet': 'gouter', 'miel-fleurs': 'gouter'
};

const BY_CATEGORY: Record<Food['category'], Aisle> = {
  fruit: 'produce',
  legume: 'produce',
  proteine: 'boucherie',
  glucide: 'epicerie-salee',
  lipide: 'gouter',
  autre: 'gouter'
};

/** Rayon d'un aliment : correspondance explicite, sinon repli sur la catégorie. */
export function aisleForFood(food: Food): Aisle {
  return BY_ID[food.id] ?? BY_CATEGORY[food.category];
}
