import type { Food } from '@/types';

/**
 * Base d'aliments précharge. IDs stables (kebab-case) pour pouvoir référencer
 * depuis le plan type et les imports/exports.
 * Valeurs pour 100g. État (raw/cooked) précisé par aliment.
 * `commonServings` = équivalents parlants (ex: "1 œuf = 50g") pour faciliter
 * la saisie quand on débute.
 * `portionMaxG` = plafond journalier plausible, dans l'état NATIF de l'aliment.
 * Il ne borne pas la saisie manuelle : il borne le SOLVEUR de portions, pour qu'une
 * sélection d'aliments pauvre ne fasse pas absorber tout l'écart calorique par un
 * seul aliment (900 g de pommes de terre, 400 g de flocons…). Volontairement large :
 * c'est un garde-fou anti-absurdité, pas une recommandation de portion.
 * Non renseigné sur les légumes et les fruits : ils sont figés par le solveur.
 * `portionStepG` = plus petit morceau réaliste, dans l'état NATIF. Renseigné sur les
 * aliments qui se mangent par PIÈCES (œuf, banane, boîte de thon, carré de chocolat) :
 * leurs quantités sont arrondies à un multiple de ce pas, pour ne jamais proposer un
 * tiers de banane. Absent sur ce qui se pèse librement (riz, viande, fromage blanc).
 * `nutrients` = micronutriments dont l'aliment est une source NOTABLE (cf. lib/coverage).
 * Marqueur qualitatif, pas une teneur : il sert à détecter qu'une source a disparu du
 * plan, pas à calculer des apports. On ne marque donc que les sources franches.
 * `tags` = composition (viande, poisson, lacté, œuf, gluten, fruits à coque, arachide).
 * Base des profils alimentaires et des exclusions strictes (cf. lib/diet). Descriptif :
 * on étiquette ce que l'aliment CONTIENT, l'utilisateur décide de ce qu'il exclut.
 */
type SeedFood = Omit<Food, 'createdAt'>;

export const SEED_FOODS: SeedFood[] = [
  // —— Protéines animales ——
  { id: 'poulet-blanc-cru',  name: 'Blanc de poulet (cru)',   kcalPer100g: 110, proteinPer100g: 23,   carbsPer100g: 0,  fatPer100g: 1.5, category: 'proteine', isCustom: false, state: 'raw', cookedFactor: 0.7, portionMaxG: 400,
    nutrients: ['b12'],
    tags: ['viande'],
    commonServings: [{ label: '1 blanc moyen', grams: 150 }, { label: '1 petit blanc', grams: 120 }] },
  { id: 'steak-hache-5-cru', name: 'Viande hachée 5% (crue)', kcalPer100g: 130, proteinPer100g: 21,   carbsPer100g: 0,  fatPer100g: 5,   category: 'proteine', isCustom: false, state: 'raw', cookedFactor: 0.75, portionMaxG: 350,
    nutrients: ['fer', 'b12'],
    tags: ['viande'],
    commonServings: [{ label: '1 portion', grams: 125 }, { label: '1 grosse portion', grams: 150 }] },
  { id: 'oeuf-entier',       name: 'Œuf entier',              kcalPer100g: 143, proteinPer100g: 12.5, carbsPer100g: 0.7,fatPer100g: 10,  category: 'proteine', isCustom: false, state: 'raw', portionMaxG: 300, portionStepG: 50,
    nutrients: ['b12'],
    tags: ['oeuf'],
    commonServings: [{ label: '1 œuf moyen', grams: 50 }, { label: '1 gros œuf', grams: 60 }] },
  { id: 'fromage-blanc-0',   name: 'Fromage blanc 0%',        kcalPer100g: 47,  proteinPer100g: 8,    carbsPer100g: 4,  fatPer100g: 0.2, category: 'proteine', isCustom: false, state: 'raw', portionMaxG: 600,
    nutrients: ['calcium', 'b12'],
    tags: ['lacte'],
    commonServings: [{ label: '1 pot', grams: 100 }, { label: '1 gros bol', grams: 250 }] },
  { id: 'sardines-boite',    name: 'Sardines en boîte',       kcalPer100g: 200, proteinPer100g: 25,   carbsPer100g: 0,  fatPer100g: 11,  category: 'proteine', isCustom: false, state: 'cooked', portionMaxG: 200, portionStepG: 90,
    nutrients: ['omega3', 'fer', 'calcium', 'b12'],
    tags: ['poisson'],
    commonServings: [{ label: '1 boîte égouttée', grams: 90 }] },
  { id: 'thon-naturel',      name: 'Thon au naturel',         kcalPer100g: 110, proteinPer100g: 26,   carbsPer100g: 0,  fatPer100g: 1,   category: 'proteine', isCustom: false, state: 'cooked', portionMaxG: 300, portionStepG: 130,
    nutrients: ['fer', 'b12'],
    tags: ['poisson'],
    commonServings: [{ label: '1 boîte égouttée', grams: 130 }, { label: '1 petite boîte', grams: 80 }] },
  // Whey Nutrimuscle Native Isolate Mix (goût fraise) — protéine rapide, post-training.
  { id: 'whey',              name: 'Whey isolate/native fraise (Nutrimuscle)', kcalPer100g: 369, proteinPer100g: 80, carbsPer100g: 9.7, fatPer100g: 0.9, category: 'proteine', isCustom: false, state: 'raw', portionMaxG: 60, portionStepG: 15,
    tags: ['lacte'],
    commonServings: [{ label: '1 dose', grams: 30 }, { label: '1/2 dose', grams: 15 }] },

  // Tofu ferme : SEULE source de protéines de la base qui survive à un profil végétalien
  // (toutes les autres portent viande / poisson / œuf / lacté). Sans lui, ce profil vide
  // le rôle « protéines » et la diète ne peut plus se composer.
  { id: 'tofu-ferme',        name: 'Tofu ferme',              kcalPer100g: 145, proteinPer100g: 15,   carbsPer100g: 3,  fatPer100g: 8,   category: 'proteine', isCustom: false, state: 'raw', portionMaxG: 400,
    nutrients: ['fer', 'calcium'],
    commonServings: [{ label: '1 portion', grams: 150 }] },

  // —— Glucides ——
  { id: 'riz-blanc-sec',     name: 'Riz blanc (sec)',         kcalPer100g: 350, proteinPer100g: 7,    carbsPer100g: 78, fatPer100g: 0.6, category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 2.5, portionMaxG: 200,
    commonServings: [{ label: '1 portion sèche', grams: 80 }] },
  { id: 'riz-complet-sec',   name: 'Riz complet (sec)',       kcalPer100g: 350, proteinPer100g: 7.5,  carbsPer100g: 73, fatPer100g: 2.5, category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 2.5, portionMaxG: 200,
    nutrients: ['fibres'],
    commonServings: [{ label: '1 portion sèche', grams: 80 }] },
  { id: 'pates-completes-sec', name: 'Pâtes complètes (sec)', kcalPer100g: 350, proteinPer100g: 13,   carbsPer100g: 65, fatPer100g: 2.5, category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 2.2, portionMaxG: 200,
    nutrients: ['fibres'],
    tags: ['gluten'],
    commonServings: [{ label: '1 portion sèche', grams: 80 }] },
  { id: 'pomme-de-terre-cru',name: 'Pommes de terre (cru)',   kcalPer100g: 77,  proteinPer100g: 2,    carbsPer100g: 17, fatPer100g: 0.1, category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 0.9, portionMaxG: 700,
    nutrients: ['vitamineC', 'fibres'],
    commonServings: [{ label: '1 moyenne', grams: 150 }, { label: '1 grosse', grams: 250 }] },
  // Crème de riz Nutrimuscle : farine de riz complet précuite, glucide RAPIDE peu
  // rassasiant. Idéale en pré/post-training (digestion facile, recharge le glycogène),
  // inspirée des diètes de prise de masse (cf. Repas 1 « pré-training » type Moise Mike).
  // Se pèse SÈCHE, se mélange à l'eau/lait. Pas de cookedFactor : on pèse toujours la poudre.
  // Deux parfums INTERCHANGEABLES (on n'en consomme qu'un) : le choix se fait dans
  // « Ingrédients d'appoint » (cf. AddonFood.variants). Valeurs des étiquettes Nutrimuscle ;
  // celles de la vanille sont données par portion de 40 g, ramenées ici à 100 g (×2,5).
  { id: 'creme-de-riz-chocolat', name: 'Crème de riz chocolat (Nutrimuscle)', kcalPer100g: 362, proteinPer100g: 8.8, carbsPer100g: 69.9, fatPer100g: 4,   category: 'glucide', isCustom: false, state: 'raw', portionMaxG: 150,
    commonServings: [{ label: '1 portion', grams: 40 }, { label: 'grosse portion', grams: 80 }] },
  { id: 'creme-de-riz-vanille',  name: 'Crème de riz vanille (Nutrimuscle)',  kcalPer100g: 365, proteinPer100g: 7.4, carbsPer100g: 74.3, fatPer100g: 3.3, category: 'glucide', isCustom: false, state: 'raw', portionMaxG: 150,
    commonServings: [{ label: '1 portion', grams: 40 }, { label: 'grosse portion', grams: 80 }] },
  // Collation PRÉ-TRAINING des jours de séance (cf. lib/trainingDay) : galettes + miel +
  // banane, glucides rapides peu gras et peu fibreux. Valeurs de l'étiquette Regain
  // (2 galettes = 15 g) ; se compte à la galette.
  { id: 'galettes-riz-complet', name: 'Galettes de riz complet (Regain)', kcalPer100g: 385, proteinPer100g: 8.4, carbsPer100g: 80, fatPer100g: 2.6, category: 'glucide', isCustom: false, state: 'raw', portionMaxG: 120, portionStepG: 7.5,
    nutrients: ['fibres'],
    commonServings: [{ label: '1 galette', grams: 7.5 }, { label: '4 galettes', grams: 30 }] },
  // Miel de fleurs Lune de Miel (Open Food Facts, EAN 3088540255279). Rangé en « autre » :
  // le moteur de substitution ne doit jamais le proposer à la place d'un féculent.
  { id: 'miel-fleurs',       name: 'Miel de fleurs (Lune de Miel)', kcalPer100g: 320, proteinPer100g: 0, carbsPer100g: 80, fatPer100g: 0, category: 'autre', isCustom: false, state: 'raw', portionMaxG: 40,
    commonServings: [{ label: '½ c.à.c', grams: 3.5 }, { label: '1 c.à.c', grams: 7 }] },
  { id: 'flocons-avoine',    name: "Flocons d'avoine",        kcalPer100g: 370, proteinPer100g: 13,   carbsPer100g: 60, fatPer100g: 7,   category: 'glucide', isCustom: false, state: 'raw', portionMaxG: 160,
    nutrients: ['fibres'],
    tags: ['gluten'],
    commonServings: [{ label: '1 bol', grams: 60 }, { label: '1 c.à.s', grams: 10 }] },
  { id: 'lentilles-seches',  name: 'Lentilles (sèches)',      kcalPer100g: 340, proteinPer100g: 24,   carbsPer100g: 50, fatPer100g: 1.5, category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 2.9, portionMaxG: 180,
    nutrients: ['fer', 'folates', 'fibres'],
    commonServings: [{ label: '1 portion sèche', grams: 80 }] },

  { id: 'pois-chiches',      name: 'Pois chiches (secs)',     kcalPer100g: 364, proteinPer100g: 19,   carbsPer100g: 61, fatPer100g: 6,   category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 2.5, portionMaxG: 180,
    nutrients: ['fer', 'folates', 'fibres'],
    commonServings: [{ label: '1 portion sèche', grams: 80 }] },
  { id: 'haricots-rouges',   name: 'Haricots rouges (secs)',  kcalPer100g: 333, proteinPer100g: 23,   carbsPer100g: 50, fatPer100g: 1,   category: 'glucide', isCustom: false, state: 'raw', cookedFactor: 2.6, portionMaxG: 180,
    nutrients: ['fer', 'folates', 'fibres'],
    commonServings: [{ label: '1 portion sèche', grams: 80 }] },

  // —— Fruits ——
  { id: 'banane',            name: 'Banane',                  kcalPer100g: 90,  proteinPer100g: 1.1,  carbsPer100g: 20, fatPer100g: 0.3, category: 'fruit',   isCustom: false, state: 'raw', portionStepG: 55,
    nutrients: ['fibres'],
    commonServings: [{ label: '1 banane moyenne', grams: 110 }, { label: '1 grosse banane', grams: 140 }] },
  { id: 'kiwi',              name: 'Kiwi',                    kcalPer100g: 61,  proteinPer100g: 1.1,  carbsPer100g: 15, fatPer100g: 0.5, category: 'fruit',   isCustom: false, state: 'raw', portionStepG: 40,
    nutrients: ['vitamineC', 'fibres'],
    commonServings: [{ label: '1 kiwi', grams: 80 }] },
  // Mélange surgelé (groseille/cassis/myrtille/framboise/mûre) — antioxydants, dispo toute l'année. Parfait avec le fromage blanc.
  { id: 'fruits-rouges-surgeles', name: 'Fruits rouges surgelés (mélange)', kcalPer100g: 40, proteinPer100g: 1, carbsPer100g: 6, fatPer100g: 0.4, category: 'fruit', isCustom: false, state: 'raw',
    nutrients: ['vitamineC', 'fibres'],
    commonServings: [{ label: '1 poignée', grams: 80 }, { label: '1 portion', grams: 100 }] },
  { id: 'pomme',             name: 'Pomme',                   kcalPer100g: 52,  proteinPer100g: 0.3,  carbsPer100g: 14, fatPer100g: 0.2, category: 'fruit',   isCustom: false, state: 'raw', portionStepG: 75,
    nutrients: ['fibres'],
    commonServings: [{ label: '1 pomme moyenne', grams: 150 }] },
  { id: 'datte',             name: 'Datte',                   kcalPer100g: 282, proteinPer100g: 2.7,  carbsPer100g: 75, fatPer100g: 0.3, category: 'fruit',   isCustom: false, state: 'raw', portionStepG: 7,
    nutrients: ['fibres'],
    commonServings: [{ label: '1 datte', grams: 7 }, { label: '3 dattes', grams: 21 }] },

  // —— Lipides ——
  { id: 'amandes',           name: 'Amandes',                 kcalPer100g: 580, proteinPer100g: 21,   carbsPer100g: 9,  fatPer100g: 49,  category: 'lipide',  isCustom: false, state: 'raw', portionMaxG: 80,
    nutrients: ['calcium', 'fibres'],
    tags: ['fruits-a-coque'],
    commonServings: [{ label: '1 poignée (~10)', grams: 12 }, { label: '1 grosse poignée', grams: 25 }] },
  { id: 'noix',              name: 'Noix',                    kcalPer100g: 654, proteinPer100g: 15,   carbsPer100g: 14, fatPer100g: 65,  category: 'lipide',  isCustom: false, state: 'raw', portionMaxG: 70,
    nutrients: ['fibres'],
    tags: ['fruits-a-coque'],
    commonServings: [{ label: '1 cerneau', grams: 4 }, { label: '1 poignée (~5)', grams: 20 }] },
  { id: 'beurre-cacahuete',  name: 'Beurre de cacahuète',     kcalPer100g: 600, proteinPer100g: 25,   carbsPer100g: 20, fatPer100g: 50,  category: 'lipide',  isCustom: false, state: 'raw', portionMaxG: 70,
    nutrients: ['fibres'],
    tags: ['arachide'],
    commonServings: [{ label: '1 c.à.s', grams: 16 }, { label: '1 c.à.c', grams: 6 }] },
  { id: 'huile-olive',       name: "Huile d'olive",           kcalPer100g: 900, proteinPer100g: 0,    carbsPer100g: 0,  fatPer100g: 100, category: 'lipide',  isCustom: false, state: 'raw', portionMaxG: 50,
    commonServings: [{ label: '1 c.à.s', grams: 10 }, { label: '1 c.à.c', grams: 5 }] },
  { id: 'chocolat-noir-80',  name: 'Chocolat noir 80%',       kcalPer100g: 598, proteinPer100g: 12,   carbsPer100g: 46, fatPer100g: 43,  category: 'lipide',  isCustom: false, state: 'raw', portionMaxG: 50, portionStepG: 5,
    commonServings: [{ label: '1 carré', grams: 5 }, { label: '2 carrés', grams: 10 }] },

  // —— Légumes ——
  { id: 'haricots-verts',    name: 'Haricots verts',          kcalPer100g: 31,  proteinPer100g: 1.8,  carbsPer100g: 7,  fatPer100g: 0.1, category: 'legume',  isCustom: false, state: 'cooked',
    nutrients: ['fibres'],
    commonServings: [{ label: '1 portion', grams: 200 }] },
  { id: 'asperges-vertes',   name: 'Asperges vertes',         kcalPer100g: 20,  proteinPer100g: 2.2,  carbsPer100g: 4,  fatPer100g: 0.1, category: 'legume',  isCustom: false, state: 'cooked',
    nutrients: ['folates', 'fibres'],
    commonServings: [{ label: '1 portion (~6)', grams: 150 }] },
  { id: 'carottes',          name: 'Carottes',                kcalPer100g: 41,  proteinPer100g: 0.9,  carbsPer100g: 10, fatPer100g: 0.2, category: 'legume',  isCustom: false, state: 'raw',
    nutrients: ['fibres'],
    commonServings: [{ label: '1 carotte', grams: 80 }, { label: '1 portion', grams: 150 }] },
  { id: 'poivron-rouge',     name: 'Poivron rouge',           kcalPer100g: 31,  proteinPer100g: 1,    carbsPer100g: 6,  fatPer100g: 0.3, category: 'legume',  isCustom: false, state: 'raw',
    nutrients: ['vitamineC', 'fibres'],
    commonServings: [{ label: '1/2 poivron', grams: 75 }, { label: '1 poivron', grams: 150 }] },
  { id: 'tomates',           name: 'Tomates',                 kcalPer100g: 18,  proteinPer100g: 0.9,  carbsPer100g: 3.9,fatPer100g: 0.2, category: 'legume',  isCustom: false, state: 'raw',
    nutrients: ['vitamineC', 'fibres'],
    commonServings: [{ label: '1 tomate', grams: 120 }] },
  { id: 'courgette',         name: 'Courgette',               kcalPer100g: 17,  proteinPer100g: 1.2,  carbsPer100g: 3.1,fatPer100g: 0.3, category: 'legume',  isCustom: false, state: 'raw',
    nutrients: ['fibres'],
    commonServings: [{ label: '1/2 courgette', grams: 150 }, { label: '1 courgette', grams: 300 }] },
  // Légumes dispo toute l'année (frais ou surgelés) — base de la rotation.
  { id: 'brocoli',           name: 'Brocoli (cuit)',          kcalPer100g: 35,  proteinPer100g: 2.4,  carbsPer100g: 5,  fatPer100g: 0.4, category: 'legume',  isCustom: false, state: 'cooked',
    nutrients: ['vitamineC', 'folates', 'calcium', 'fibres'],
    commonServings: [{ label: '1 portion', grams: 150 }] },
  { id: 'epinards',          name: 'Épinards (cuits)',        kcalPer100g: 23,  proteinPer100g: 2.9,  carbsPer100g: 3,  fatPer100g: 0.4, category: 'legume',  isCustom: false, state: 'cooked',
    nutrients: ['fer', 'folates', 'calcium', 'fibres'],
    commonServings: [{ label: '1 portion', grams: 150 }] },
  { id: 'champignons',       name: 'Champignons de Paris (cuits)', kcalPer100g: 28, proteinPer100g: 3.1, carbsPer100g: 3.3, fatPer100g: 0.4, category: 'legume', isCustom: false, state: 'cooked',
    nutrients: ['fibres'],
    commonServings: [{ label: '1 portion', grams: 150 }] }
];

// Bump à chaque modif du seed pour réinjecter (sans toucher aux aliments custom).
// v11 : plafonds de portion, pas de portion, marqueurs micronutriments, étiquettes de
// composition, et ajout du tofu + pois chiches + haricots rouges (profils végé).
// v12 : crème de riz (glucide rapide pré/post-training) + 3 sandwichs CROUS (crous:true).
// v13 : retrait des sandwichs CROUS (mode étudiant abandonné) ; crème de riz conservée.
// v14 : crème de riz générique remplacée par les 2 références Nutrimuscle (chocolat,
// vanille), interchangeables via le sélecteur de parfum des ingrédients d'appoint.
// v15 : galettes de riz complet Regain + miel de fleurs (collation pré-training des jours
// de séance, cf. lib/trainingDay).
// v16 : « Steak haché 5% » renommé « Viande hachée 5% » (même id, mêmes macros).
export const SEED_VERSION = 16;

/**
 * Aliments retirés du seed entre versions. Supprimés au prochain démarrage
 * SAUF s'ils ont été personnalisés (isCustom=true).
 */
export const DEPRECATED_FOOD_IDS = [
  'cabillaud-cru',
  // Retirés en v6 — plus utilisés dans la diète (fin des stocks).
  'quinoa-sec',
  'galette-riz-complet',
  'pompotes-ssa',
  'barre-proteinee-nv',
  // Retirés en v8 — toppings quasi nuls en calories, ajoutés manuellement au besoin.
  'cannelle-moulue',
  'cacao-poudre',
  // Retirés en v9 — réadaptation de la diète.
  'myrtilles',      // remplacées par le kiwi (même rôle antioxydant, faible densité)
  'betterave-cuite', // remplacée par les épinards (folates/nitrates)
  // NB : 'whey' réintégrée en v9 (Nutrimuscle Native Isolate fraise) → retirée d'ici.
  // Retirés en v13 — mode étudiant CROUS abandonné.
  'crous-sandwich-poulet-crudites',
  'crous-sandwich-thon-mayo',
  'crous-sandwich-jambon-beurre',
  // Retiré en v14 — remplacé par les 2 références Nutrimuscle (chocolat / vanille).
  'creme-de-riz'
];
