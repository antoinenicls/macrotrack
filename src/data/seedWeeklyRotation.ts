import type { Food, PlanTemplateMeal } from '@/types';
import { SEED_FOODS } from './seedFoods';
import { isDiscrete, quantizeGrams } from '@/lib/portions';

/**
 * Rotation hebdomadaire optimisée — conçue pour ta base d'aliments + tes macros
 * (cible : 2450 kcal · 187g P · 75g L · 255g G).
 *
 * Cette semaine se RÉPÈTE à l'infini : ton plan du Lundi est le même chaque semaine.
 * Ça donne 7 menus à mémoriser au lieu de cuisiner à l'aveugle.
 *
 * ─── Logique de stockage (2 sessions de cuisson) ──────────────────
 * Tu cuisines en lot 2 fois par semaine, et chaque aliment frais est mangé
 * sur 3 jours adjacents max (jamais plus de 3 j au frigo) :
 *  - BATCH 1 — cuisson DIMANCHE → consommé Lun / Mar / Mer
 *      poulet ×3, steak ×3, riz blanc ×3, pommes de terre ×3
 *  - BATCH 2 — cuisson MERCREDI SOIR → consommé Jeu / Ven / Sam
 *      poulet ×3, steak ×1, riz complet ×3, pâtes ×3
 *  - DIMANCHE = jour "conserves" : sardines + thon (zéro cuisson, zéro stockage).
 *      Ses féculents (riz blanc + pdt) se cuisent frais le jour même (jour léger).
 * Chaque protéine/féculent frais est donc cuit UNE fois par batch et regroupé
 * sur des jours consécutifs → un seul gros lot à cuire, consommé vite.
 *
 * Stratégie anti-carence :
 *  - 2 sardines / sem (oméga-3 EPA/DHA, vit D, calcium) — placées Ven + Dim
 *  - 2 thon / sem (iode, sélénium, B12) — placés Sam + Dim
 *  - 4 viandes rouges (viande hachée 5%) → fer héminique, zinc, B12
 *  - 6 poulets → protéine maigre
 *  - Œufs + fromage blanc quotidiens → calcium, choline, B12
 *  - 2 lentilles / sem (Mer + Ven soir, en remplacement d'un féculent) → folates, fibres, prébiotiques
 *  - Rotation glucides : riz blanc / complet / pâtes / pommes de terre / lentilles
 *  - Rotation LÉGUMES dispo TOUTE L'ANNÉE (frais ou surgelés) — couvre vitamines A/C/K & antioxydants :
 *      carottes (bêta-carotène, ×3) · brocoli (vit C, crucifère, ×3) · épinards (fer, folates, ×4) ·
 *      champignons (×2) · haricots verts surgelés (×2)
 *  - Rotation fruits : banane / kiwi / pomme / dattes / fruits rouges surgelés (antioxydants)
 *  - Rotation oléagineux : amandes / noix / beurre cacahuète + chocolat noir
 *  - À COMPLÉTER hors app : vitamine D3 (supplément) + sel iodé.
 *
 * ─── Collations ───────────────────────────────────────────────────
 * La collation quotidienne apporte le complément de protéines (~40-45g) :
 * elle combine FROMAGE BLANC 0% + 1 dose de WHEY (Nutrimuscle isolate/native
 * fraise, protéine rapide post-training) + oléagineux pour les lipides
 * + une poignée de FRUITS ROUGES surgelés (antioxydants, se marient au fromage
 * blanc) / 2 carrés de chocolat.
 *
 * Quantités en CUIT pour les aliments meal-prep (poulet, steak, riz, pâtes, pdt).
 *
 * Macros par jour : ~2450-2475 kcal / 187-194g P / 70-78g L / 247-280g G
 * (moyenne semaine ≈ 2463 kcal / 190g P / 74g L / 263g G).
 * Vérifie 1-2 jours dans l'onglet Plan, qui affiche le total par jour.
 */

// Base PD : 3 œufs + fromage blanc + flocons d'avoine (toujours identique)
const PD_BASE = [
  { foodId: 'oeuf-entier',     grams: 150, cooked: false }, // 3 œufs
  { foodId: 'fromage-blanc-0', grams: 250, cooked: false },
  { foodId: 'flocons-avoine',  grams: 60,  cooked: false }
];

// 1 c.à.s d'huile olive au déjeuner pour cuisson + boost lipides
const OIL = { foodId: 'huile-olive', grams: 10, cooked: false };

export const SEED_WEEKLY_ROTATION: Record<string, PlanTemplateMeal[]> = {
  // ─── LUNDI · BATCH 1 (cuit dim) : poulet + steak ───────────────
  // poulet/riz blanc (déj) · steak/pdt (dîner) · légumes : carottes + haricots
  '1': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'banane', grams: 110, cooked: false },
      { foodId: 'kiwi',   grams: 80,  cooked: false }
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'poulet-blanc-cru', grams: 126, cooked: true },  // ≈ 180g cru
      { foodId: 'riz-blanc-sec',    grams: 225, cooked: true },  // ≈ 90g sec
      { foodId: 'carottes',         grams: 150, cooked: true },  // bêta-carotène
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'steak-hache-5-cru',  grams: 113, cooked: true }, // ≈ 150g cru
      { foodId: 'pomme-de-terre-cru', grams: 315, cooked: true }, // ≈ 350g cru
      { foodId: 'haricots-verts',     grams: 200, cooked: true },
      { foodId: 'kiwi',               grams: 80,  cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0',  grams: 230, cooked: false },
      { foodId: 'whey',             grams: 30,  cooked: false }, // post-training
      { foodId: 'beurre-cacahuete', grams: 24,  cooked: false },
      { foodId: 'amandes',          grams: 30,  cooked: false },
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false } // avec le fromage blanc
    ]}
  ],

  // ─── MARDI · BATCH 1 : steak + poulet (ordre inversé) ──────────
  // steak/pdt (déj) · poulet/riz blanc (dîner) · légumes : brocoli + épinards
  '2': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'pomme',           grams: 150, cooked: false }
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'steak-hache-5-cru',  grams: 113, cooked: true },
      { foodId: 'pomme-de-terre-cru', grams: 315, cooked: true },
      { foodId: 'brocoli',            grams: 200, cooked: true },  // vit C + crucifère
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'poulet-blanc-cru', grams: 126, cooked: true },
      { foodId: 'riz-blanc-sec',    grams: 225, cooked: true },
      { foodId: 'epinards',         grams: 150, cooked: true },  // fer + folates
      { foodId: 'banane',           grams: 110, cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0',  grams: 250, cooked: false },
      { foodId: 'whey',             grams: 30,  cooked: false }, // post-training
      { foodId: 'beurre-cacahuete', grams: 30,  cooked: false },
      { foodId: 'amandes',          grams: 30,  cooked: false },
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false } // avec le fromage blanc
    ]}
  ],

  // ─── MERCREDI · BATCH 1 (fin) : poulet + steak ─────────────────
  // poulet/riz blanc (déj) · steak/LENTILLES (dîner) — épuise le lot du dimanche
  // légumes : champignons + carottes
  '3': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'kiwi',                 grams: 80,  cooked: false }, // 1 kiwi
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false } // antioxydants
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'poulet-blanc-cru', grams: 126, cooked: true },
      { foodId: 'riz-blanc-sec',    grams: 225, cooked: true },
      { foodId: 'champignons',      grams: 150, cooked: true }, // B vitamines
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'steak-hache-5-cru', grams: 113, cooked: true },
      { foodId: 'lentilles-seches',  grams: 250, cooked: true }, // folates + fibres (remplace pdt)
      { foodId: 'carottes',          grams: 150, cooked: true },
      { foodId: 'kiwi',              grams: 80,  cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0', grams: 180, cooked: false },
      { foodId: 'whey',            grams: 30,  cooked: false }, // post-training
      { foodId: 'noix',            grams: 22,  cooked: false },
      { foodId: 'amandes',         grams: 22,  cooked: false },
      { foodId: 'banane',          grams: 110, cooked: false }
    ]}
  ],

  // ─── JEUDI · BATCH 2 (cuit mer soir) : steak + poulet ──────────
  // steak/riz complet (déj) · poulet/pâtes (dîner) · légumes : brocoli + épinards
  '4': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'banane', grams: 110, cooked: false },
      { foodId: 'noix',   grams: 10,  cooked: false }
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'steak-hache-5-cru', grams: 113, cooked: true },
      { foodId: 'riz-complet-sec',   grams: 225, cooked: true }, // ≈ 90g sec
      { foodId: 'brocoli',           grams: 150, cooked: true }, // vit C + crucifère
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'poulet-blanc-cru',    grams: 126, cooked: true },
      { foodId: 'pates-completes-sec', grams: 198, cooked: true },
      { foodId: 'epinards',            grams: 150, cooked: true }, // fer + folates (ex-betterave)
      { foodId: 'pomme',               grams: 150, cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0',  grams: 200, cooked: false },
      { foodId: 'whey',             grams: 30,  cooked: false }, // post-training
      { foodId: 'beurre-cacahuete', grams: 30,  cooked: false },
      { foodId: 'amandes',          grams: 20,  cooked: false },
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false } // avec le fromage blanc
    ]}
  ],

  // ─── VENDREDI · BATCH 2 : sardines + poulet ────────────────────
  // sardines/riz complet (déj, conserve) · poulet/LENTILLES (dîner)
  // légumes : épinards + brocoli
  '5': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'datte', grams: 14, cooked: false }, // 2 dattes
      { foodId: 'kiwi',  grams: 80, cooked: false }
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'sardines-boite',   grams: 90,  cooked: true }, // 1 boîte
      { foodId: 'riz-complet-sec',  grams: 225, cooked: true },
      { foodId: 'epinards',         grams: 150, cooked: true }, // fer + folates (ex-betterave)
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'poulet-blanc-cru', grams: 126, cooked: true },
      { foodId: 'lentilles-seches', grams: 250, cooked: true }, // folates + fibres (remplace pâtes)
      { foodId: 'brocoli',          grams: 150, cooked: true }, // vit C + crucifère
      { foodId: 'banane',           grams: 110, cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0',  grams: 220, cooked: false },
      { foodId: 'whey',             grams: 30,  cooked: false }, // post-training
      { foodId: 'beurre-cacahuete', grams: 30,  cooked: false },
      { foodId: 'amandes',          grams: 28,  cooked: false },
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false } // avec le fromage blanc
    ]}
  ],

  // ─── SAMEDI · BATCH 2 (fin) : thon + poulet ────────────────────
  // thon/riz complet (déj, conserve) · poulet/pâtes (dîner) — épuise le lot de mer
  // légumes : haricots + champignons
  '6': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'pomme',           grams: 150, cooked: false }
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'thon-naturel',    grams: 130, cooked: true }, // 1 boîte
      { foodId: 'riz-complet-sec', grams: 225, cooked: true },
      { foodId: 'haricots-verts',  grams: 200, cooked: true },
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'poulet-blanc-cru',    grams: 126, cooked: true },
      { foodId: 'pates-completes-sec', grams: 198, cooked: true },
      { foodId: 'champignons',         grams: 150, cooked: true },
      { foodId: 'kiwi',                grams: 80,  cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0',  grams: 230, cooked: false },
      { foodId: 'whey',             grams: 30,  cooked: false }, // post-training
      { foodId: 'noix',             grams: 28,  cooked: false },
      { foodId: 'amandes',          grams: 28,  cooked: false },
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false }, // avec le fromage blanc
      { foodId: 'chocolat-noir-80', grams: 10,  cooked: false }    // 2 carrés
    ]}
  ],

  // ─── DIMANCHE · jour CONSERVES : sardines + thon ───────────────
  // sardines/riz blanc (déj) · thon/pdt (dîner) — aucune viande à stocker.
  // Féculents (riz blanc + pdt) cuits frais le jour même · légumes : épinards + carottes
  '7': [
    { slot: 'petit-dej', items: [...PD_BASE,
      { foodId: 'banane',               grams: 110, cooked: false },
      { foodId: 'kiwi',                 grams: 80,  cooked: false }, // 1 kiwi
      { foodId: 'fruits-rouges-surgeles', grams: 80,  cooked: false }
    ]},
    { slot: 'dejeuner', items: [
      { foodId: 'sardines-boite', grams: 90,  cooked: true }, // 1 boîte
      { foodId: 'riz-blanc-sec',  grams: 225, cooked: true },
      { foodId: 'epinards',       grams: 150, cooked: true }, // fer + folates
      OIL
    ]},
    { slot: 'diner', items: [
      { foodId: 'thon-naturel',       grams: 190, cooked: true }, // ~1,5 boîte (jour à protéine maigre)
      { foodId: 'pomme-de-terre-cru', grams: 315, cooked: true },
      { foodId: 'carottes',           grams: 150, cooked: true },
      { foodId: 'kiwi',               grams: 80,  cooked: false }
    ]},
    { slot: 'collation', items: [
      { foodId: 'fromage-blanc-0', grams: 300, cooked: false },
      { foodId: 'whey',            grams: 30,  cooked: false }, // post-training
      { foodId: 'noix',            grams: 22,  cooked: false },
      { foodId: 'amandes',         grams: 24,  cooked: false },
      { foodId: 'fruits-rouges-surgeles', grams: 100, cooked: false } // avec le fromage blanc
    ]}
  ]
};

/**
 * À bumper à chaque modif de la rotation pour la re-appliquer aux installs existantes.
 */
// v13 : re-application via la sélection d'aliments + résolveur réel + plafonds de portion.
export const ROTATION_VERSION = 13;

/**
 * Calibration de référence de la rotation : ~2450 kcal/jour.
 * Sert de base au calcul d'échelle quand l'utilisateur change d'objectif
 * (Sèche forte → 2390 kcal → toutes les portions ×0.976, etc.).
 */
export const SEED_ROTATION_BASE_KCAL = 2450;

/* ─── Scaling « protéines + lipides fixes, légumes/fruits préservés » ───
 * Quand l'objectif (ou le poids / la MG) change, on NE multiplie PAS tout
 * uniformément. On résout par jour pour viser EXACTEMENT trois cibles à la fois —
 * calories, protéines ET lipides — en ne faisant flexer que 3 groupes :
 *   - protéines (poulet, steak, œufs, fromage blanc, poissons),
 *   - lipides (huile, oléagineux, beurre de cacahuète, chocolat),
 *   - glucides (riz, pâtes, pdt, avoine, lentilles).
 * Les LÉGUMES, FRUITS (et « autre ») restent FIGÉS à leur quantité de référence :
 * on préserve fibres, micronutriments, satiété et volume — surtout en sèche, quand
 * c'est le plus précieux. Les féculents absorbent l'essentiel de la variation
 * calorique ; protéines et lipides restent calés sur leurs cibles santé.
 */

/**
 * Ce dont le solveur a besoin d'un aliment. Volontairement structurel (pas `Food`) :
 * un aliment CRÉÉ ou ÉDITÉ par l'utilisateur doit être résolu aussi bien qu'un aliment
 * du seed.
 */
type FoodLike = Pick<
  Food,
  'kcalPer100g' | 'proteinPer100g' | 'fatPer100g' | 'category' | 'state' | 'cookedFactor'
  | 'portionMaxG' | 'portionStepG' | 'commonServings'
>;

/** Résolveur d'aliment (typiquement `useFoodsStore.byId`, qui voit les aliments perso). */
export type FoodResolver = (id: string) => FoodLike | undefined;

const SEED_FOOD_BY_ID = new Map<string, FoodLike>(SEED_FOODS.map((f) => [f.id, f]));
/**
 * Repli quand aucun résolveur n'est fourni : la base seed FIGÉE. Ne convient qu'à la
 * rotation curée telle quelle. Dès que la sélection d'aliments de l'utilisateur entre en
 * jeu (substitution, aliment perso, macros éditées), il FAUT passer un vrai résolveur,
 * sinon les aliments inconnus comptent pour 0 et le solveur dérive.
 */
const seedResolver: FoodResolver = (id) => SEED_FOOD_BY_ID.get(id);

/** Grammes "natifs" (sur lesquels portent les macros /100g) selon le toggle cru/cuit. */
function nativeGrams(f: FoodLike | undefined, grams: number, cooked: boolean): number {
  if (!f) return grams;
  const isCooked = f.state === 'cooked';
  if (cooked === isCooked) return grams;
  const cf = f.cookedFactor ?? 1;
  return cooked && f.state === 'raw' ? grams / cf : grams * cf;
}

/** Macros d'un item pour un grammage donné (exprimé dans l'unité de l'item). */
function itemMacros(f: FoodLike | undefined, grams: number, cooked: boolean) {
  if (!f) return { P: 0, F: 0, K: 0 };
  const g = nativeGrams(f, grams, cooked) / 100;
  return { P: f.proteinPer100g * g, F: f.fatPer100g * g, K: f.kcalPer100g * g };
}

type ScaleGroup = 'prot' | 'fat' | 'carb' | 'fixed';
/** Légumes / fruits / « autre » = figés ; seuls protéines, lipides, glucides flexent. */
function scaleGroupOf(f: FoodLike | undefined): ScaleGroup {
  const c = f?.category;
  if (c === 'proteine') return 'prot';
  if (c === 'lipide') return 'fat';
  if (c === 'glucide') return 'carb';
  return 'fixed';
}

/** Résout un système linéaire carré (élimination de Gauss). Null si quasi-singulier. */
function solveLinear(m: number[][], b: number[]): number[] | null {
  const n = b.length;
  const a = m.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-9) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / a[col][col];
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => row[n] / row[i]);
}

type GroupSums = Record<ScaleGroup, { P: number; F: number; K: number }>;

const FLEX_GROUPS = ['prot', 'fat', 'carb'] as const;
/**
 * Poids des trois équations, exprimés en kcal : rater 1 g de protéines coûte 4, 1 g de
 * lipides 9, 1 kcal 1. Ça rend les erreurs comparables et évite d'écraser la cible
 * lipides (petits nombres) sous la cible calorique (grands nombres).
 */
const EQ_WEIGHT = [4, 9, 1];

/**
 * Facteurs d'échelle des groupes flexibles pour atteindre les cibles, la part `fixed`
 * étant déjà retirée.
 *
 * Moindres carrés pondérés sur les groupes ENCORE variables, et non un système 3×3 fixe.
 * Au fil des passes, des groupes entiers se retrouvent épinglés (plafond de portion,
 * arrondi aux pièces) : le système devient alors singulier. L'ancien repli visait
 * calories + protéines et LAISSAIT TOMBER les lipides, ce qui faisait dériver de 20 g un
 * jour où le fromage blanc butait sur son plafond. Ici, on résout sur ce qui reste
 * réellement pilotable, en visant les trois cibles au mieux.
 *
 * Les facteurs négatifs (le solveur voudrait retirer plus que ce qui existe) sont remis à
 * zéro et le groupe sort des variables, jusqu'à stabilisation.
 */
function solveFactors(
  sums: GroupSums,
  targetKcal: number,
  targetProteinG: number,
  targetFatG: number
): Record<ScaleGroup, number> {
  const target = [
    targetProteinG - sums.fixed.P,
    targetFatG - sums.fixed.F,
    targetKcal - sums.fixed.K
  ];
  const column = (g: (typeof FLEX_GROUPS)[number]) => [sums[g].P, sums[g].F, sums[g].K];
  const isActive = (g: (typeof FLEX_GROUPS)[number]) => column(g).some((v) => Math.abs(v) > 1e-9);

  const out: Record<ScaleGroup, number> = { prot: 1, fat: 1, carb: 1, fixed: 1 };
  let vars = FLEX_GROUPS.filter(isActive);

  // Ensemble actif : on retire les groupes dont le facteur part en négatif, puis on
  // re-résout. Au plus une élimination par groupe.
  for (let round = 0; round <= FLEX_GROUPS.length && vars.length > 0; round++) {
    const cols = vars.map(column);
    // Équations normales pondérées : (AᵀWA) x = AᵀW b.
    const m = cols.map((cj) =>
      cols.map((ck) => cj.reduce((s, v, i) => s + EQ_WEIGHT[i] ** 2 * v * ck[i], 0))
    );
    const rhs = cols.map((cj) => cj.reduce((s, v, i) => s + EQ_WEIGHT[i] ** 2 * v * target[i], 0));
    const sol = solveLinear(m, rhs);
    if (!sol) break;

    const negative = vars.filter((_, j) => sol[j] < 0);
    vars.forEach((g, j) => { out[g] = Math.max(0, Math.min(6, sol[j])); });
    if (negative.length === 0) return out;
    // Groupes remis à zéro : ils sortent des variables pour la passe suivante.
    for (const g of negative) out[g] = 0;
    vars = vars.filter((g) => !negative.includes(g));
  }
  return out;
}

/**
 * Garde-fou de boucle. Chaque passe épingle soit tous les dépassements de plafond, soit
 * UN aliment à la pièce ; il ne peut donc pas y avoir plus de passes que d'items, plus
 * quelques tours pour les plafonds.
 */
const MAX_SOLVE_PASSES = 40;

/**
 * Re-calibre la rotation pour viser EXACTEMENT `targetKcal`, `targetProteinG` et
 * `targetFatG` par jour (les glucides en découlent : la cible kcal les fixe).
 * Variables = facteurs d'échelle des groupes protéines / lipides / glucides ;
 * légumes & fruits figés. On résout le système 3×3 :
 *    sP·Pp + sL·Pl + sC·Pc = targetProteinG − Pfix
 *    sP·Fp + sL·Fl + sC·Fc = targetFatG     − Ffix
 *    sP·Kp + sL·Kl + sC·Kc = targetKcal     − Kfix
 * Si la solution est dégénérée ou hors bornes (facteur < 0 ou > 6), repli sur un
 * scaling « protéines-fixes » 2 variables (lipides+glucides ensemble, légumes/fruits
 * toujours figés), puis sur un scaling uniforme. Quantités arrondies (min 1 g).
 *
 * `foodById` : résolveur d'aliments. À FOURNIR dès que le plan peut contenir autre chose
 * que la rotation curée (aliments perso, macros éditées, substitution par sélection) —
 * sinon ces aliments comptent pour 0 et le solveur gonfle tout le reste. Sans argument,
 * repli sur la base seed figée.
 *
 * Les items dont l'aliment déclare un `portionMaxG` ne dépassent jamais ce plafond : ils
 * sont épinglés et l'écart calorique restant part sur les autres aliments flexibles. Si
 * plus rien ne peut absorber, le jour reste sous sa cible (préférable à une portion
 * absurde).
 */
export function scaleRotationToTargets(
  rotation: Record<string, PlanTemplateMeal[]>,
  targetKcal: number,
  targetProteinG: number,
  targetFatG: number,
  foodById: FoodResolver = seedResolver
): Record<string, PlanTemplateMeal[]> {
  const out: Record<string, PlanTemplateMeal[]> = {};
  for (const [day, meals] of Object.entries(rotation)) {
    const all = meals.flatMap((m) => m.items);
    const foods = all.map((it) => foodById(it.foodId));
    const groups = foods.map(scaleGroupOf);
    // Items épinglés à leur plafond de portion (index → grammes, unité de l'item).
    const pinned = new Map<number, number>();
    let factor: Record<ScaleGroup, number> = { prot: 1, fat: 1, carb: 1, fixed: 1 };

    for (let pass = 0; pass < MAX_SOLVE_PASSES; pass++) {
      const sums: GroupSums = {
        prot: { P: 0, F: 0, K: 0 }, fat: { P: 0, F: 0, K: 0 },
        carb: { P: 0, F: 0, K: 0 }, fixed: { P: 0, F: 0, K: 0 }
      };
      all.forEach((it, i) => {
        const capped = pinned.get(i);
        const m = itemMacros(foods[i], capped ?? it.grams, it.cooked);
        // Un item épinglé n'est plus une variable : il rejoint la part figée.
        const g = sums[capped != null ? 'fixed' : groups[i]];
        g.P += m.P; g.F += m.F; g.K += m.K;
      });

      factor = solveFactors(sums, targetKcal, targetProteinG, targetFatG);

      // Dépassements de plafond. Le plafond porte sur le TOTAL du jour pour un aliment,
      // pas sur une occurrence : trois portions d'œufs de 180 g font quand même 11 œufs.
      const dayTotal = new Map<string, number>();
      all.forEach((it, i) => {
        const f = foods[i];
        if (!f?.portionMaxG || groups[i] === 'fixed') return;
        const grams = pinned.get(i) ?? it.grams * factor[groups[i]];
        dayTotal.set(it.foodId, (dayTotal.get(it.foodId) ?? 0) + nativeGrams(f, grams, it.cooked));
      });

      let changed = false;
      for (const [foodId, total] of dayTotal) {
        const cap = foodById(foodId)?.portionMaxG;
        if (cap == null || total <= cap + 0.5) continue;
        // Rabot proportionnel sur toutes les occurrences du jour, puis épinglage.
        const ratio = cap / total;
        all.forEach((it, i) => {
          if (it.foodId !== foodId || groups[i] === 'fixed') return;
          const grams = pinned.get(i) ?? it.grams * factor[groups[i]];
          pinned.set(i, Math.max(1, Math.floor(grams * ratio)));
        });
        changed = true;
      }

      // Aliments qui se mangent par pièces : on les arrête sur un morceau entier et on
      // les épingle. Le reste du repas (riz, viande, huile, qui se pèsent librement)
      // absorbe l'écart, donc la journée retombe sur sa cible SANS demander de couper un
      // tiers de banane.
      //
      // UN SEUL par passe, du plus calorique au moins calorique. Les épingler tous d'un
      // coup ferait arrondir chacun d'après un facteur qui ne tient pas compte des
      // arrondis des autres : les erreurs s'additionnent au lieu de se compenser, et un
      // jour à deux conserves dérivait de 10 g de protéines. En les figeant l'un après
      // l'autre, chaque arrondi est calculé sur un plan déjà re-résolu.
      if (!changed) {
        let best = -1;
        let bestKcal = -1;
        all.forEach((it, i) => {
          const f = foods[i];
          if (pinned.has(i) || groups[i] === 'fixed' || !isDiscrete(f)) return;
          const k = itemMacros(f, it.grams * factor[groups[i]], it.cooked).K;
          if (k > bestKcal) { bestKcal = k; best = i; }
        });
        if (best >= 0) {
          const it = all[best];
          pinned.set(best, quantizeGrams(foods[best], it.grams * factor[groups[best]], it.cooked));
          changed = true;
        }
      }
      if (!changed) break;
    }

    let i = 0;
    out[day] = meals.map((m) => ({
      slot: m.slot,
      items: m.items.map((it) => {
        const idx = i++;
        const capped = pinned.get(idx);
        return {
          ...it,
          grams: capped ?? Math.max(1, Math.round(it.grams * factor[groups[idx]]))
        };
      })
    }));
  }
  return out;
}
