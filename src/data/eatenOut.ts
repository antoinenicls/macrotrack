import type { EatenOutCategory, EatenOutExtra, HandPortions, MealEstimate, MealSlot } from '@/types';

/**
 * Sentinel `foodId` des items "mangé à l'extérieur" : ils ne référencent aucun
 * aliment réel, leurs macros viennent de `MealItem.estimate`.
 */
export const EATEN_OUT_FOOD_ID = 'eaten-out';

export interface EatenOutPreset extends MealEstimate {
  /** Un preset a TOUJOURS une catégorie (re-narrow : `category` est optionnel sur MealEstimate). */
  category: EatenOutCategory;
  label: string;
  desc: string;
  emoji: string;
  /** Forfait générique (« copieux », « léger »…) plutôt qu'un plat précis. */
  generic?: boolean;
}

type MealType = 'breakfast' | 'main' | 'snack';

/** Mappe le créneau de repas vers le bon jeu de catégories. */
export function mealTypeForSlot(slot: MealSlot): MealType {
  if (slot === 'petit-dej') return 'breakfast';
  if (slot === 'collation') return 'snack';
  return 'main'; // dejeuner, diner
}

export const MEAL_TYPE_LABEL: Record<MealType, string> = {
  breakfast: 'Petit-déj',
  main: 'Plats',
  snack: 'En-cas'
};

/**
 * Estimations ADAPTÉES au moment de la journée (un petit-déj dehors n'a rien à voir avec
 * un dîner ou une collation). Plats précis d'abord (portion « normale » de resto ou de
 * boulangerie en France, valeurs moyennes Ciqual / enseignes), puis les forfaits génériques
 * quand rien ne ressemble. Volontairement rondes et transparentes (« estimé ») : le but est
 * de garder le suivi quand la pesée est impossible, pas une précision absolue.
 * kcal = valeur de référence affichée.
 */
const GROUPS: Record<MealType, EatenOutPreset[]> = {
  breakfast: [
    { category: 'pdej-croissant',     emoji: '🥐', label: 'Croissant',              desc: '1 croissant au beurre',                          kcal: 250, protein: 5,  carbs: 27, fat: 13 },
    { category: 'pdej-pain-choc',     emoji: '🍫', label: 'Pain au chocolat',       desc: '1 pain au chocolat',                             kcal: 300, protein: 6,  carbs: 33, fat: 16 },
    { category: 'pdej-tartines',      emoji: '🍞', label: 'Tartines beurre-confiture', desc: '2 tartines de baguette, beurre + confiture',  kcal: 350, protein: 8,  carbs: 55, fat: 11 },
    { category: 'pdej-cereales',      emoji: '🥣', label: 'Bol de céréales',        desc: 'Céréales + lait demi-écrémé',                    kcal: 350, protein: 12, carbs: 60, fat: 7 },
    { category: 'pdej-oeufs-pain',    emoji: '🍳', label: 'Œufs + pain',            desc: '2 œufs brouillés / au plat + 1 tranche de pain',  kcal: 400, protein: 22, carbs: 30, fat: 21 },
    { category: 'pdej-pancakes',      emoji: '🥞', label: 'Pancakes',               desc: '3 pancakes + sirop d’érable',                    kcal: 550, protein: 12, carbs: 85, fat: 18 },
    { category: 'pdej-avocado-toast', emoji: '🥑', label: 'Avocado toast',          desc: 'Pain + ½ avocat + œuf',                          kcal: 450, protein: 17, carbs: 35, fat: 27 },
    { category: 'pdej-granola',       emoji: '🍓', label: 'Yaourt granola',         desc: 'Yaourt + granola + fruits',                      kcal: 400, protein: 14, carbs: 55, fat: 14 },
    { category: 'pdej-leger',     emoji: '☕', generic: true, label: 'Léger',                 desc: 'Café + fruit, yaourt, petit bol de céréales…',          kcal: 250, protein: 12, carbs: 35, fat: 6 },
    { category: 'pdej-classique', emoji: '🍽', generic: true, label: 'Petit-déj classique',   desc: 'Tartines pain + beurre/confiture, œufs, jus…',          kcal: 450, protein: 18, carbs: 55, fat: 16 },
    { category: 'pdej-brunch',    emoji: '🍽', generic: true, label: 'Brunch copieux',        desc: 'Œufs, bacon, pancakes, avocado toast…',                 kcal: 750, protein: 30, carbs: 70, fat: 38 },
    { category: 'pdej-sucre',     emoji: '🍽', generic: true, label: 'Viennoiseries / sucré', desc: 'Croissant, pain au chocolat, latte sucré, pâtisserie…', kcal: 600, protein: 10, carbs: 70, fat: 30 }
  ],
  main: [
    { category: 'main-pizza',        emoji: '🍕', label: 'Pizza',               desc: '1 pizza entière (~30 cm), garniture classique', kcal: 1000, protein: 42, carbs: 120, fat: 38 },
    { category: 'main-burger-frites', emoji: '🍔', label: 'Burger + frites',    desc: 'Burger maison ou menu fast-food, frites moyennes', kcal: 880, protein: 35, carbs: 90, fat: 42 },
    { category: 'main-kebab',        emoji: '🥙', label: 'Kebab',               desc: 'Sandwich kebab sauce blanche, sans frites',    kcal: 750,  protein: 38, carbs: 70,  fat: 35 },
    { category: 'main-tacos',        emoji: '🌯', label: 'Tacos (taille M)',    desc: 'Tacos français, viande + frites + sauce fromagère', kcal: 1100, protein: 45, carbs: 105, fat: 55 },
    { category: 'main-sushi',        emoji: '🍣', label: 'Sushis / makis',      desc: '12 à 16 pièces, sans tempura',                 kcal: 600,  protein: 25, carbs: 95,  fat: 12 },
    { category: 'main-poke',         emoji: '🥗', label: 'Poke bowl',           desc: 'Riz, poisson/poulet, avocat, sauce',           kcal: 650,  protein: 30, carbs: 80,  fat: 22 },
    { category: 'main-pates',        emoji: '🍝', label: 'Pâtes au resto',      desc: 'Carbonara, bolognaise, pesto… (assiette)',     kcal: 850,  protein: 32, carbs: 100, fat: 33 },
    { category: 'main-asiatique',    emoji: '🥡', label: 'Plat asiatique',      desc: 'Wok, pad thaï, riz cantonais, curry + riz',    kcal: 800,  protein: 30, carbs: 100, fat: 30 },
    { category: 'main-salade',       emoji: '🥬', label: 'Salade composée',     desc: 'César, niçoise… avec sauce et croûtons',       kcal: 550,  protein: 30, carbs: 25,  fat: 36 },
    { category: 'main-sandwich',     emoji: '🥖', label: 'Sandwich boulangerie', desc: 'Jambon-beurre, poulet crudités, panini…',     kcal: 550,  protein: 25, carbs: 60,  fat: 22 },
    { category: 'main-steak-frites', emoji: '🥩', label: 'Steak-frites',        desc: 'Pièce de bœuf + frites (bistrot)',             kcal: 950,  protein: 50, carbs: 70,  fat: 50 },
    { category: 'main-couscous',     emoji: '🍲', label: 'Couscous / mijoté',   desc: 'Couscous, tajine, bourguignon, blanquette…',   kcal: 850,  protein: 40, carbs: 90,  fat: 35 },
    { category: 'main-galette',      emoji: '🫓', label: 'Galette complète',    desc: 'Galette sarrasin jambon-œuf-fromage',          kcal: 550,  protein: 25, carbs: 50,  fat: 27 },
    { category: 'main-quiche',       emoji: '🥧', label: 'Quiche + salade',     desc: 'Part de quiche lorraine + salade verte',       kcal: 650,  protein: 20, carbs: 45,  fat: 43 },
    { category: 'main-cantine',      emoji: '🍛', label: 'Cantine / self',      desc: 'Plat du jour + accompagnement, sans entrée ni dessert', kcal: 650, protein: 35, carbs: 70, fat: 24 },
    { category: 'main-raclette',     emoji: '🧀', label: 'Raclette / fondue',   desc: 'Fromage fondu, pommes de terre, charcuterie',  kcal: 1300, protein: 55, carbs: 90,  fat: 80 },
    { category: 'main-leger',     emoji: '🍽', generic: true, label: 'Léger & sain',           desc: 'Salade composée, poisson + légumes, sushi raisonnable…',     kcal: 450,  protein: 35, carbs: 35,  fat: 18 },
    { category: 'main-equilibre', emoji: '🍽', generic: true, label: 'Restaurant équilibré',   desc: 'Viande/poisson + féculent + légumes (assiette « propre »)',  kcal: 700,  protein: 45, carbs: 70,  fat: 25 },
    { category: 'main-copieux',   emoji: '🍽', generic: true, label: 'Restaurant copieux',     desc: 'Plat en sauce, burger maison, entrée + plat…',               kcal: 1000, protein: 50, carbs: 95,  fat: 45 },
    { category: 'main-fastfood',  emoji: '🍽', generic: true, label: 'Fast-food / gros écart', desc: 'KFC, McDo, pizza, dessert + boisson sucrée…',                kcal: 1300, protein: 55, carbs: 135, fat: 60 }
  ],
  snack: [
    { category: 'snack-fruit',        emoji: '🍎', label: 'Fruit',                desc: '1 pomme, banane, poire…',                kcal: 90,  protein: 1,  carbs: 21, fat: 0 },
    { category: 'snack-skyr-fruit',   emoji: '🥛', label: 'Skyr / yaourt + fruit', desc: 'Pot de skyr ou yaourt grec 0 % + fruit', kcal: 200, protein: 17, carbs: 25, fat: 3 },
    { category: 'snack-barre-prot',   emoji: '💪', label: 'Barre protéinée',      desc: '1 barre de 50-60 g',                     kcal: 220, protein: 20, carbs: 20, fat: 7 },
    { category: 'snack-oleagineux',   emoji: '🥜', label: 'Poignée d’oléagineux', desc: '~30 g d’amandes, noix, cajou…',          kcal: 180, protein: 6,  carbs: 5,  fat: 15 },
    { category: 'snack-viennoiserie', emoji: '🥐', label: 'Viennoiserie',         desc: 'Croissant, pain au chocolat, chausson…', kcal: 280, protein: 5,  carbs: 30, fat: 15 },
    { category: 'snack-cookie',       emoji: '🍪', label: 'Cookie / muffin',      desc: '1 gros cookie ou muffin de boulangerie', kcal: 400, protein: 5,  carbs: 50, fat: 20 },
    { category: 'snack-patisserie',   emoji: '🍰', label: 'Pâtisserie',           desc: 'Éclair, tarte aux fruits, flan…',        kcal: 350, protein: 5,  carbs: 45, fat: 17 },
    { category: 'snack-glace',        emoji: '🍦', label: 'Glace',                desc: '2 boules ou 1 cornet',                   kcal: 280, protein: 4,  carbs: 35, fat: 14 },
    { category: 'snack-chips',        emoji: '🥔', label: 'Chips',                desc: 'Petit paquet (~45 g)',                   kcal: 240, protein: 3,  carbs: 24, fat: 15 },
    { category: 'snack-barre-choco',  emoji: '🍫', label: 'Barre chocolatée',     desc: 'Mars, Snickers, Twix…',                  kcal: 250, protein: 3,  carbs: 32, fat: 12 },
    { category: 'snack-leger',     emoji: '🍽', generic: true, label: 'Léger',            desc: 'Fruit, yaourt nature, poignée d’oléagineux…',    kcal: 150, protein: 8,  carbs: 18, fat: 6 },
    { category: 'snack-equilibre', emoji: '🍽', generic: true, label: 'En-cas équilibré', desc: 'Yaourt grec + fruit, barre protéinée, skyr…',    kcal: 250, protein: 18, carbs: 25, fat: 8 },
    { category: 'snack-gourmand',  emoji: '🍽', generic: true, label: 'Gourmand',         desc: 'Pâtisserie, viennoiserie, cookie, café sucré…',  kcal: 450, protein: 8,  carbs: 55, fat: 22 },
    { category: 'snack-ecart',     emoji: '🍽', generic: true, label: 'Gros écart',       desc: 'Glace, grosse part de gâteau, snack fast-food…', kcal: 700, protein: 12, carbs: 80, fat: 35 }
  ]
};

const FLAT = new Map<EatenOutCategory, EatenOutPreset>(
  Object.values(GROUPS).flat().map((p) => [p.category, p])
);

/** Jeu de catégories à proposer pour un créneau donné. */
export function presetsForSlot(slot: MealSlot): EatenOutPreset[] {
  return GROUPS[mealTypeForSlot(slot)];
}

/** Plats des AUTRES moments de la journée (un brunch au déjeuner, une pâtisserie au dîner…). */
export function otherPresetGroups(slot: MealSlot): Array<{ label: string; presets: EatenOutPreset[] }> {
  const own = mealTypeForSlot(slot);
  return (Object.keys(GROUPS) as MealType[])
    .filter((t) => t !== own)
    .map((t) => ({ label: MEAL_TYPE_LABEL[t], presets: GROUPS[t].filter((p) => !p.generic) }));
}

export function presetFor(category: EatenOutCategory): EatenOutPreset {
  return FLAT.get(category) ?? GROUPS.main[1];
}

/* =========================================================================
 *  Taille de la portion et SUPPLÉMENTS : ce qui fait le plus varier l'addition
 *  d'un repas dehors (boisson, dessert, pain, sauce…), comptés à l'unité.
 * ========================================================================= */

export const PORTION_SIZES: Array<{ value: number; label: string }> = [
  { value: 0.75, label: 'Petite' },
  { value: 1, label: 'Normale' },
  { value: 1.3, label: 'Grande' },
  { value: 1.6, label: 'XXL' }
];

export interface ExtraDef {
  key: EatenOutExtra;
  emoji: string;
  label: string;
  desc: string;
  /** Macros d'UNE unité ; `kcal` inclut l'alcool (7 kcal/g, hors P/G/L). */
  per: { kcal: number; protein: number; carbs: number; fat: number };
}

export const EXTRAS: ExtraDef[] = [
  { key: 'soda',     emoji: '🥤', label: 'Soda / jus',      desc: '33 cl, sucré',              per: { kcal: 140, protein: 0, carbs: 35, fat: 0 } },
  { key: 'biere',    emoji: '🍺', label: 'Bière',           desc: 'Demi 25 cl',                per: { kcal: 105, protein: 1, carbs: 9,  fat: 0 } },
  { key: 'vin',      emoji: '🍷', label: 'Vin',             desc: 'Verre 12 cl',               per: { kcal: 85,  protein: 0, carbs: 3,  fat: 0 } },
  { key: 'cocktail', emoji: '🍹', label: 'Cocktail',        desc: 'Mojito, spritz…',           per: { kcal: 200, protein: 0, carbs: 20, fat: 0 } },
  { key: 'latte',    emoji: '☕', label: 'Café latte sucré', desc: 'Latte, cappuccino, mocha', per: { kcal: 120, protein: 5, carbs: 15, fat: 4 } },
  { key: 'pain',     emoji: '🍞', label: 'Pain',            desc: '1 morceau de baguette',     per: { kcal: 105, protein: 4, carbs: 21, fat: 0 } },
  { key: 'frites',   emoji: '🍟', label: 'Frites',          desc: '1 portion moyenne',         per: { kcal: 330, protein: 4, carbs: 42, fat: 16 } },
  { key: 'sauce',    emoji: '🫙', label: 'Sauce',           desc: 'Mayo, ketchup-mayo, vinaigrette', per: { kcal: 100, protein: 0, carbs: 1, fat: 11 } },
  { key: 'fromage',  emoji: '🧀', label: 'Fromage',         desc: '1 portion (~30 g)',         per: { kcal: 110, protein: 7, carbs: 0,  fat: 9 } },
  { key: 'entree',   emoji: '🥗', label: 'Entrée',          desc: 'Salade, soupe, charcuterie…', per: { kcal: 250, protein: 10, carbs: 20, fat: 14 } },
  { key: 'dessert',  emoji: '🍮', label: 'Dessert',         desc: 'Fondant, tiramisu, tarte…', per: { kcal: 400, protein: 5, carbs: 50, fat: 20 } }
];

const EXTRA_BY_KEY = new Map(EXTRAS.map((e) => [e.key, e]));
type Extras = Partial<Record<EatenOutExtra, number>>;

/** Somme des suppléments + suppléments non nuls (à mémoriser), ou undefined si aucun. */
function extrasTotals(extras: Extras | undefined) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const kept: Extras = {};
  for (const [key, n] of Object.entries(extras ?? {}) as Array<[EatenOutExtra, number]>) {
    const def = EXTRA_BY_KEY.get(key);
    if (!def || !n || n <= 0) continue;
    kept[key] = n;
    t.kcal += def.per.kcal * n;
    t.protein += def.per.protein * n;
    t.carbs += def.per.carbs * n;
    t.fat += def.per.fat * n;
  }
  return { ...t, kept: Object.keys(kept).length > 0 ? kept : undefined };
}

/** Construit le snapshot d'estimation par catégorie (taille et suppléments compris) à stocker dans le MealItem. */
export function estimateFor(category: EatenOutCategory, size = 1, extras?: Extras): MealEstimate {
  const p = presetFor(category);
  const ex = extrasTotals(extras);
  return {
    method: 'category',
    category: p.category,
    ...(size !== 1 ? { size } : {}),
    ...(ex.kept ? { extras: ex.kept } : {}),
    kcal: Math.round(p.kcal * size + ex.kcal),
    protein: Math.round(p.protein * size + ex.protein),
    carbs: Math.round(p.carbs * size + ex.carbs),
    fat: Math.round(p.fat * size + ex.fat)
  };
}

/* =========================================================================
 *  Méthode des PORTIONS À LA MAIN (Precision Nutrition) — estimation sans balance.
 *  Chaque geste correspond à une quantité-type d'un macronutriment. On compose
 *  l'assiette (paumes de protéine, poignées de féculent, etc.) → vraies macros,
 *  pas un forfait. Bien plus juste que « ce repas ≈ N kcal » car ça suit ce qui
 *  est réellement dans l'assiette. Valeurs PAR UNITÉ, calibrables.
 * ========================================================================= */

export type HandPortionKey = keyof HandPortions;

export interface HandPortionDef {
  key: HandPortionKey;
  emoji: string;
  /** Geste de référence. */
  gesture: string;
  label: string;
  desc: string;
  /** Macros apportées par UNE unité de ce geste (grammes). */
  per: { protein: number; carbs: number; fat: number };
}

/**
 * 1 paume ≈ une portion de viande/poisson de la taille et l'épaisseur de la paume ;
 * 1 poignée (cupped hand) ≈ une portion de féculent cuit ; 1 pouce ≈ une portion de
 * matière grasse ; 1 poignée verte ≈ une portion de légumes. Réfs Precision Nutrition,
 * légèrement prudentes côté protéine (on n'optimise pas en sa faveur).
 */
export const HAND_PORTIONS: HandPortionDef[] = [
  { key: 'protein', emoji: '🖐', gesture: '1 paume', label: 'Protéine', desc: 'Viande, poisson, œufs, tofu…',          per: { protein: 25, carbs: 0,  fat: 6 } },
  { key: 'carbs',   emoji: '✊', gesture: '1 poignée', label: 'Féculent', desc: 'Riz, pâtes, pain, frites, pdt…',       per: { protein: 3,  carbs: 25, fat: 1 } },
  { key: 'fat',     emoji: '👍', gesture: '1 pouce', label: 'Matière grasse', desc: 'Huile, beurre, sauce, fromage, oléagineux…', per: { protein: 0,  carbs: 0,  fat: 11 } },
  { key: 'veg',     emoji: '🥦', gesture: '1 poignée', label: 'Légumes', desc: 'Crudités, légumes cuits…',             per: { protein: 2,  carbs: 5,  fat: 0 } }
];

export const ZERO_PORTIONS: HandPortions = { protein: 0, carbs: 0, fat: 0, veg: 0 };

/** Compose un snapshot d'estimation depuis un décompte de portions à la main (+ suppléments). */
export function estimateFromPortions(portions: HandPortions, extras?: Extras): MealEstimate {
  let protein = 0, carbs = 0, fat = 0;
  for (const def of HAND_PORTIONS) {
    const n = portions[def.key] || 0;
    protein += def.per.protein * n;
    carbs += def.per.carbs * n;
    fat += def.per.fat * n;
  }
  protein = Math.round(protein);
  carbs = Math.round(carbs);
  fat = Math.round(fat);
  const ex = extrasTotals(extras);
  const kcal = Math.round(protein * 4 + carbs * 4 + fat * 9 + ex.kcal);
  return {
    method: 'hand',
    portions: { ...portions },
    ...(ex.kept ? { extras: ex.kept } : {}),
    kcal,
    protein: Math.round(protein + ex.protein),
    carbs: Math.round(carbs + ex.carbs),
    fat: Math.round(fat + ex.fat)
  };
}

/** Libellé + détail prêts à afficher pour un repas estimé (les deux méthodes). */
export function describeEstimate(est: MealEstimate): { label: string; detail: string | null } {
  const extras = EXTRAS
    .filter((d) => (est.extras?.[d.key] || 0) > 0)
    .map((d) => `${d.emoji}×${formatCount(est.extras![d.key]!)}`);
  if (est.method === 'hand' && est.portions) {
    const parts = HAND_PORTIONS
      .filter((d) => (est.portions![d.key] || 0) > 0)
      .map((d) => `${d.emoji}×${formatCount(est.portions![d.key])}`);
    const detail = [...parts, ...extras].join('  ');
    return { label: 'Assiette estimée', detail: detail || null };
  }
  // Catégorie (ou ancien snapshot sans method).
  const size = est.size && est.size !== 1 ? PORTION_SIZES.find((s) => s.value === est.size)?.label ?? `×${est.size}` : null;
  const detail = [...(size ? [`Portion ${size.toLowerCase()}`] : []), ...extras].join('  ·  ');
  return { label: est.category ? presetFor(est.category).label : 'Repas estimé', detail: detail || null };
}

function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}
