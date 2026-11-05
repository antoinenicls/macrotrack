import type { Food, Nutrient, PlanTemplateMeal, MealSlot } from '@/types';
import { toNativeGrams } from './nutrition';

/* =========================================================================
 *  Couverture micronutritionnelle de la semaine.
 *
 *  La rotation curée promet une diète anti-carence (oméga-3 deux fois par
 *  semaine, fer, folates…). Dès que l'utilisateur change ses aliments, cette
 *  promesse peut disparaître SANS que rien ne bouge côté macros : remplacer les
 *  sardines par du poulet garde 2450 kcal et 187 g de protéines, et supprime
 *  les EPA/DHA. Ce module regarde le plan RÉELLEMENT appliqué et dit ce qui
 *  manque.
 *
 *  Méthode, volontairement grossière et lisible : un jour « couvre » un
 *  micronutriment si la somme des quantités (en grammes natifs) des aliments qui
 *  en sont une source notable atteint un seuil. On compare ensuite le nombre de
 *  jours couverts à un minimum hebdomadaire. C'est un signal d'alerte, pas un
 *  calcul d'apports : l'app ne stocke pas les teneurs réelles en micronutriments,
 *  et prétendre le contraire serait malhonnête.
 *  Pur, sans I/O → testable.
 * ========================================================================= */

export interface NutrientMeta {
  label: string;
  /** Grammes (natifs) d'aliments sources à réunir dans la journée pour la compter couverte. */
  minGramsPerDay: number;
  /** Nombre de jours couverts attendus sur 7. */
  minDaysPerWeek: number;
  /** Pourquoi ça compte, en une ligne, pour l'écran de bilan. */
  why: string;
}

export const NUTRIENT_META: Record<Nutrient, NutrientMeta> = {
  omega3: {
    label: 'Oméga-3 (EPA/DHA)',
    minGramsPerDay: 60, minDaysPerWeek: 2,
    why: 'Poissons gras. Rien d\'autre n\'en apporte vraiment : les noix fournissent de l\'ALA, très mal converti.'
  },
  fer: {
    label: 'Fer',
    minGramsPerDay: 100, minDaysPerWeek: 4,
    why: 'Viande rouge, poissons, légumineuses, épinards. Premier à décrocher quand on retire la viande.'
  },
  calcium: {
    label: 'Calcium',
    minGramsPerDay: 150, minDaysPerWeek: 5,
    why: 'Produits laitiers, amandes, crucifères. Compte double en sèche prolongée.'
  },
  folates: {
    label: 'Folates',
    minGramsPerDay: 100, minDaysPerWeek: 3,
    why: 'Légumineuses et légumes verts foncés.'
  },
  vitamineC: {
    label: 'Vitamine C',
    minGramsPerDay: 100, minDaysPerWeek: 5,
    why: 'Fruits et légumes crus ou peu cuits. Aide aussi à absorber le fer végétal.'
  },
  b12: {
    label: 'Vitamine B12',
    minGramsPerDay: 100, minDaysPerWeek: 6,
    why: 'Uniquement d\'origine animale. Une diète 100 % végétale impose un supplément.'
  },
  fibres: {
    label: 'Fibres',
    minGramsPerDay: 250, minDaysPerWeek: 6,
    why: 'Légumes, fruits, céréales complètes, légumineuses. Satiété et transit.'
  }
};

export const NUTRIENT_ORDER: readonly Nutrient[] = [
  'omega3', 'fer', 'b12', 'calcium', 'folates', 'vitamineC', 'fibres'
];

export interface CoverageLine {
  nutrient: Nutrient;
  /** Jours de la semaine (sur 7) qui atteignent le seuil. */
  days: number;
  /** Jours attendus. */
  minDays: number;
  ok: boolean;
  /**
   * Aliments qui combleraient le trou, choisis parmi ceux que l'utilisateur n'a PAS
   * sélectionnés (les sources déjà autorisées ne manquent pas, elles sont juste trop
   * peu présentes). Vide si le trou vient d'un manque de quantité, pas de source.
   */
  suggestions: Food[];
}

/** Somme des grammes natifs des aliments porteurs du marqueur, sur une journée. */
function sourceGramsForDay(
  meals: PlanTemplateMeal[],
  nutrient: Nutrient,
  foodById: (id: string) => Food | undefined
): number {
  let g = 0;
  for (const m of meals) {
    for (const it of m.items) {
      const f = foodById(it.foodId);
      if (!f?.nutrients?.includes(nutrient)) continue;
      g += toNativeGrams(f, it.grams, it.cooked);
    }
  }
  return g;
}

/**
 * Bilan de couverture du plan hebdomadaire appliqué. `allFoods` sert à proposer des
 * aliments à ajouter quand un micronutriment n'a plus de source ; `allowedIds` (la
 * sélection de l'utilisateur) permet de ne suggérer que ce qu'il n'a pas déjà coché.
 * `allowedIds` absent = tout est autorisé, donc aucune suggestion d'ajout n'a de sens.
 */
export function weeklyCoverage(
  weeklyTemplates: Record<string, PlanTemplateMeal[]> | undefined,
  foodById: (id: string) => Food | undefined,
  allFoods: Food[],
  allowedIds?: Set<string>
): CoverageLine[] {
  const days = Object.values(weeklyTemplates ?? {});
  if (days.length === 0) return [];

  return NUTRIENT_ORDER.map((nutrient) => {
    const meta = NUTRIENT_META[nutrient];
    const covered = days.filter(
      (meals) => sourceGramsForDay(meals, nutrient, foodById) >= meta.minGramsPerDay
    ).length;
    const ok = covered >= meta.minDaysPerWeek;

    // Suggestions : sources non encore autorisées, les plus « denses » d'abord (on
    // n'a pas les teneurs réelles, donc on se contente de l'ordre de la base).
    const suggestions = ok || !allowedIds
      ? []
      : allFoods.filter((f) => f.nutrients?.includes(nutrient) && !allowedIds.has(f.id)).slice(0, 4);

    return { nutrient, days: covered, minDays: meta.minDaysPerWeek, ok, suggestions };
  });
}

export interface MacroGap {
  /** Moyenne réellement servie par le plan sur la semaine. */
  kcal: number;
  protein: number;
  /** Manque moyen par rapport à la cible (0 si la cible est atteinte). */
  kcalShort: number;
  proteinShort: number;
}

/**
 * Écart entre ce que le plan sert vraiment et les cibles. Non nul quand la sélection
 * d'aliments ne PEUT PAS atteindre la cible : trop peu de sources de protéines, ou des
 * plafonds de portion qui mordent tous en même temps. Le solveur fait alors au mieux et
 * reste en dessous, ce qu'il faut dire plutôt que laisser croire à un plan sur cible.
 */
export function planMacroGap(
  weeklyTemplates: Record<string, PlanTemplateMeal[]> | undefined,
  foodById: (id: string) => Food | undefined,
  targetKcal: number,
  targetProteinG: number
): MacroGap | null {
  const days = Object.values(weeklyTemplates ?? {});
  if (days.length === 0) return null;

  let kcal = 0, protein = 0;
  for (const meals of days) {
    for (const m of meals) {
      for (const it of m.items) {
        const f = foodById(it.foodId);
        if (!f) continue;
        const k = toNativeGrams(f, it.grams, it.cooked) / 100;
        kcal += f.kcalPer100g * k;
        protein += f.proteinPer100g * k;
      }
    }
  }
  kcal /= days.length;
  protein /= days.length;

  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    // Tolérances : en dessous, c'est de l'arrondi de portions, pas un plan infaisable.
    kcalShort: Math.max(0, Math.round(targetKcal - kcal - 50)),
    proteinShort: Math.max(0, Math.round(targetProteinG - protein - 5))
  };
}

/* =========================================================================
 *  Répartition des protéines sur la journée (synthèse protéique / MPS).
 *
 *  La quantité TOTALE de protéines n'est pas le seul levier : la synthèse
 *  protéique musculaire (MPS) est maximisée quand la ration est RÉPARTIE en
 *  plusieurs prises qui atteignent chacune une « dose » d'environ 0,4 g/kg de
 *  poids (Schoenfeld & Aragon 2018 ; Areta 2013 : 4×20 g > 2×40 g > 8×10 g).
 *  Un plan qui empile 187 g de protéines mais laisse un repas principal à 8 g
 *  « gâche » une fenêtre de MPS. Ce module regarde le plan appliqué et dit si
 *  chaque repas PRINCIPAL atteint la dose. La collation n'est pas un repas
 *  principal : on ne lui impose pas la dose.
 *
 *  On ne prétend rien mesurer de plus que ce qui est dans l'assiette : c'est de
 *  l'aide au calage, pas une promesse d'anabolisme. Pur, sans I/O → testable.
 * ========================================================================= */

/** Dose de protéines (g) par repas qui maximise la MPS ≈ 0,4 g/kg de poids. */
export function mpsDoseG(weightKg: number): number {
  return Math.round(0.4 * weightKg);
}

export interface ProteinMealLine {
  slot: MealSlot;
  /** Protéines moyennes servies sur ce repas, sur la semaine (g). */
  avgProteinG: number;
  /** Repas principal (tout sauf la collation). */
  isMain: boolean;
  /** Atteint la dose MPS (repas principaux seulement). */
  reachesDose: boolean;
}

export interface ProteinBalance {
  perMeal: ProteinMealLine[];
  /** Dose visée par repas principal (g). */
  doseG: number;
  mainMealCount: number;
  mainMealsReachingDose: number;
  /** Repas principaux SOUS la dose (fenêtres de MPS gâchées). */
  underDosed: MealSlot[];
  /** Tous les repas principaux atteignent la dose. */
  ok: boolean;
}

/** Protéines (g) d'un item, en tenant compte de la conversion cru/cuit. */
function itemProteinG(f: Food | undefined, grams: number, cooked: boolean): number {
  if (!f) return 0;
  return (f.proteinPer100g * toNativeGrams(f, grams, cooked)) / 100;
}

/**
 * Bilan de la répartition protéique du plan hebdomadaire appliqué. Moyenne les protéines
 * servies par créneau sur les jours du plan, puis compare chaque repas PRINCIPAL à la dose
 * MPS (~0,4 g/kg). `null` si aucun plan. Une tolérance de 2 g évite qu'un arrondi de portion
 * fasse basculer un repas « juste à la dose » en sous-dosé.
 */
export function proteinMealBalance(
  weeklyTemplates: Record<string, PlanTemplateMeal[]> | undefined,
  foodById: (id: string) => Food | undefined,
  weightKg: number
): ProteinBalance | null {
  const days = Object.values(weeklyTemplates ?? {});
  if (days.length === 0) return null;

  const sumBySlot = new Map<MealSlot, number>();
  for (const meals of days) {
    for (const m of meals) {
      let p = 0;
      for (const it of m.items) p += itemProteinG(foodById(it.foodId), it.grams, it.cooked);
      sumBySlot.set(m.slot, (sumBySlot.get(m.slot) ?? 0) + p);
    }
  }

  const doseG = mpsDoseG(weightKg);
  const TOL = 2;
  const perMeal: ProteinMealLine[] = [];
  const underDosed: MealSlot[] = [];
  let mainMealCount = 0;
  let mainMealsReachingDose = 0;

  // Ordre chronologique stable pour l'affichage.
  const order: MealSlot[] = ['petit-dej', 'dejeuner', 'diner', 'collation'];
  for (const slot of order) {
    if (!sumBySlot.has(slot)) continue;
    const avgProteinG = Math.round((sumBySlot.get(slot)! / days.length));
    const isMain = slot !== 'collation';
    const reachesDose = isMain && avgProteinG >= doseG - TOL;
    if (isMain) {
      mainMealCount += 1;
      if (reachesDose) mainMealsReachingDose += 1;
      else underDosed.push(slot);
    }
    perMeal.push({ slot, avgProteinG, isMain, reachesDose });
  }

  return {
    perMeal,
    doseG,
    mainMealCount,
    mainMealsReachingDose,
    underDosed,
    ok: underDosed.length === 0
  };
}
