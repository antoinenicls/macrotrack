import type { Food, MacroTargets, MealItem, Profile } from '@/types';
import { ACTIVITY_FACTORS } from '@/types';

/* =========================================================================
 *  Calculs de base : BMR / TDEE / macros
 *  Toutes les fonctions sont pures, sans I/O. Faciles à tester.
 * ========================================================================= */

/**
 * BMR via Katch-McArdle si masse grasse connue (plus précis),
 * sinon Mifflin-St Jeor.
 */
export function bmr(p: Pick<Profile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct'>): number {
  if (typeof p.bodyFatPct === 'number' && p.bodyFatPct > 0 && p.bodyFatPct < 60) {
    // Katch-McArdle : 370 + 21.6 * masse maigre (kg)
    const leanMass = p.weightKg * (1 - p.bodyFatPct / 100);
    return 370 + 21.6 * leanMass;
  }
  // Mifflin-St Jeor
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.ageYears;
  return p.sex === 'M' ? base + 5 : base - 161;
}

/** TDEE = BMR × facteur d'activité. */
export function tdee(p: Pick<Profile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct' | 'activity'>): number {
  return bmr(p) * ACTIVITY_FACTORS[p.activity];
}

/**
 * Plancher calorique de SÉCURITÉ : la cible ne doit jamais descendre sous le
 * métabolisme de base (BMR), ni sous un minimum absolu (1500 kcal homme /
 * 1200 femme). Garde-fou contre une restriction dangereuse, quelle que soit la
 * combinaison déficit + ajustements automatiques.
 *
 * `allowBelowBmr` (réglage avancé) retire UNIQUEMENT le plancher BMR — pour un
 * utilisateur averti qui juge son BMR estimé trop haut et veut pousser sa sèche.
 * Le plancher ABSOLU (1500 H / 1200 F) reste appliqué dans tous les cas : c'est
 * un garde-fou non désactivable (sous ce seuil, muscle / hormones / micronutriments
 * décrochent).
 */
export function minSafeKcal(
  p: Pick<Profile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct'>,
  opts?: { allowBelowBmr?: boolean }
): number {
  const absoluteFloor = p.sex === 'M' ? 1500 : 1200;
  const floor = opts?.allowBelowBmr ? absoluteFloor : Math.max(bmr(p), absoluteFloor);
  return Math.round(floor);
}

/**
 * Fraction MAXIMALE du maintien qu'une sèche saine retire par jour, indexée sur la
 * sécheresse (%MG). Plus on est sec, plus un gros déficit attaque le muscle : on resserre.
 *   %MG élevé (H>20 / F>28)  → 25 %
 *   %MG modéré               → 20 %
 *   %MG bas (H<12 / F<22)    → 15 %
 * Sans %MG fiable → 20 % (modéré). Réf : Helms 2014, Aragon (muscle & strength pyramid).
 * Un déficit plus creux fait fondre le muscle plutôt que le gras — c'est la signature de
 * la « sèche ratée » (cible collée au métabolisme de base).
 */
export function maxDeficitFraction(p: Pick<Profile, 'sex' | 'bodyFatPct'>): number {
  const level = recommendedRateRange(p).level;
  return level === 'high' ? 0.25 : level === 'low' ? 0.15 : 0.2;
}

/**
 * Plancher de PRÉSERVATION MUSCULAIRE en sèche : la cible ne retire jamais plus que
 * `maxDeficitFraction` du maintien. = maintenance × (1 − fraction), combiné au plancher
 * BMR (le plus haut prime). C'EST le garde-fou contre la sèche ratée : quand on veut
 * perdre plus vite, il faut augmenter la DÉPENSE (cardio, pas), pas creuser le déficit
 * jusqu'au métabolisme de base — c'est ce qui coûte du muscle.
 * `allowBelowBmr` (réglage avancé « sèche agressive ») retire CE plancher ET le plancher
 * BMR : ne subsiste que le plancher absolu (1500 H / 1200 F).
 */
export function muscleSafeFloorKcal(
  p: Pick<Profile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct'>,
  maintenanceKcal: number,
  opts?: { allowBelowBmr?: boolean }
): number {
  if (opts?.allowBelowBmr) return minSafeKcal(p, opts);
  const byFraction = Math.round(maintenanceKcal * (1 - maxDeficitFraction(p)));
  return Math.max(minSafeKcal(p), byFraction);
}

/**
 * Calcule les cibles macro à partir de :
 *  - calories cibles (déficit/maintenance/surplus)
 *  - g/kg de protéines (sur poids total)
 *  - g/kg de lipides
 *  - les glucides = reste des calories
 * 1g P = 4 kcal, 1g G = 4 kcal, 1g L = 9 kcal.
 */
export function computeMacrosFromGrams(targetKcal: number, proteinG: number, fatG: number): MacroTargets {
  const protein = Math.round(proteinG);
  const fat = Math.round(fatG);
  const remainingKcal = Math.max(0, targetKcal - (protein * 4 + fat * 9));
  const carbs = Math.round(remainingKcal / 4);
  return { kcal: Math.round(targetKcal), protein, fat, carbs };
}

export function computeMacros(targetKcal: number, weightKg: number, proteinPerKg: number, fatPerKg: number): MacroTargets {
  return computeMacrosFromGrams(targetKcal, proteinPerKg * weightKg, fatPerKg * weightKg);
}

/**
 * Plancher protéique (g/kg de POIDS) quand le %MG est connu. 1,8 reste au-dessus du
 * plateau de Morton 2018 (1,6 g/kg) : sous ce seuil, plus de protéines ne sert plus le
 * muscle. Le plancher historique (`proteinPerKg`, 2,2) écrasait la formule sur masse
 * maigre et figeait ~2,65 g/kg MM même pour un sujet encore gras, au détriment des glucides.
 */
const PROTEIN_FLOOR_PER_KG_WITH_BF = 1.8;

/**
 * Protéines cibles (g/jour). Basées sur la MASSE MAIGRE quand le %MG est connu (plus juste
 * qu'un ratio sur le poids total : la graisse n'a pas besoin d'être nourrie en protéines).
 * En sèche, elles montent avec le déficit ET avec la SÉCHERESSE : Helms 2014 recommande
 * 2,3–3,1 g/kg MM, le haut de fourchette étant réservé aux sujets très secs en déficit
 * marqué (là où le corps puise le plus dans le muscle). Un sujet encore à ~18 % n'en tire
 * pas de bénéfice musculaire : mieux vaut garder ces calories en glucides (énergie,
 * qualité d'entraînement, premier levier de préservation du muscle).
 *   maintien → 2,4 g/kg MM ;
 *   déficit ≥500 → 2,4 g/kg MM à ≥18 % MG … 3,0 g/kg MM à ≤10 % MG (linéaire entre les deux).
 * Plancher : 1,8 g/kg de poids si %MG connu (cf. PROTEIN_FLOOR_PER_KG_WITH_BF), sinon le
 * ratio g/kg de poids du profil.
 */
export function proteinTargetG(p: Pick<Profile, 'weightKg' | 'bodyFatPct' | 'proteinPerKg'>, deficitKcal = 0): number {
  const bf = p.bodyFatPct;
  if (typeof bf !== 'number' || bf <= 0 || bf >= 60) return Math.round(p.proteinPerKg * p.weightKg);
  const floor = Math.min(p.proteinPerKg, PROTEIN_FLOOR_PER_KG_WITH_BF) * p.weightKg;
  const leanMass = p.weightKg * (1 - bf / 100);
  const t = Math.max(0, Math.min(1, deficitKcal / 500)); // 0 au maintien … 1 dès -500 kcal
  const leanness = Math.max(0, Math.min(1, (18 - bf) / 8)); // 0 à ≥18 % MG … 1 à ≤10 % MG
  const gPerKgLBM = 2.4 + t * leanness * 0.6;            // 2,4 → 3,0 g/kg de masse maigre
  return Math.round(Math.max(floor, gPerKgLBM * leanMass));
}

/**
 * Lipides cibles (g/jour) avec PLANCHER hormonal de sécurité. En sèche, descendre
 * trop bas en lipides abaisse la testostérone et l'absorption des vitamines
 * liposolubles (A, D, E, K). Le plancher est le plus contraignant de deux règles :
 *   MAX( 0,5 g/kg de poids ; 20 % des calories cibles ).
 * Au-dessus du plancher, on respecte le réglage du profil (`fatPerKg`, défaut 0,8).
 * Réf : Module 2.2 (ISSN 2017 ; Helms 2014). À tes réglages actuels le plancher ne
 * mord pas — il ne protège qu'en cas de cible très basse + protéines très hautes.
 */
export function fatTargetG(p: Pick<Profile, 'weightKg' | 'fatPerKg'>, targetKcal: number): number {
  const setting = p.fatPerKg * p.weightKg;
  const floorPerKg = 0.5 * p.weightKg;
  const floorPctKcal = (0.2 * targetKcal) / 9;
  return Math.round(Math.max(setting, floorPerKg, floorPctKcal));
}

export type RateLevel = 'high' | 'moderate' | 'low';
export interface RateRange {
  /** Rythme de perte recommandé (% du poids corporel / semaine). */
  min: number;
  max: number;
  level: RateLevel;
}

/**
 * Fourchette de rythme de perte RECOMMANDÉE (% du poids/sem), indexée sur le %MG :
 * plus l'athlète est sec, plus le rythme doit être lent pour préserver le muscle.
 *   %MG élevé (H>20 / F>28)   → 0,7–1,0 %/sem
 *   %MG modéré (H12-20/F22-28)→ 0,5–0,7 %/sem
 *   %MG bas (H<12 / F<22)     → 0,25–0,5 %/sem
 * Sans %MG fiable → fourchette modérée par défaut. Réf : Module 1.3
 * (Helms/Aragon/Garthe). Purement indicatif : ne borne pas le curseur, il informe.
 */
export function recommendedRateRange(p: Pick<Profile, 'sex' | 'bodyFatPct'>): RateRange {
  const bf = p.bodyFatPct;
  if (typeof bf !== 'number' || bf <= 0 || bf >= 60) return { min: 0.5, max: 0.7, level: 'moderate' };
  const highBf = p.sex === 'M' ? 20 : 28;
  const lowBf = p.sex === 'M' ? 12 : 22;
  if (bf > highBf) return { min: 0.7, max: 1.0, level: 'high' };
  if (bf < lowBf) return { min: 0.25, max: 0.5, level: 'low' };
  return { min: 0.5, max: 0.7, level: 'moderate' };
}

export interface GainRange extends RateRange {
  /**
   * %MG déjà élevé → une prise de masse ajouterait surtout du gras : mieux vaut sécher
   * d'abord. Purement indicatif (l'app ne bloque pas la prise).
   */
  cutFirst: boolean;
}

/**
 * Fourchette de rythme de PRISE de masse RECOMMANDÉE (% du poids/sem), indexée sur le
 * %MG — symétrique de {@link recommendedRateRange} mais orientée gain « propre » :
 * plus on est sec, plus on a de marge pour prendre du muscle sans excès de gras ; plus
 * on est gras, plus il faut prendre lentement (voire sécher d'abord).
 *   %MG bas (H<12 / F<22)     → 0,25–0,50 %/sem
 *   %MG modéré (H12-20/F22-28)→ 0,20–0,40 %/sem
 *   %MG élevé (H>20 / F>28)   → 0,10–0,25 %/sem + cutFirst (envisage une sèche d'abord)
 * Sans %MG fiable → fourchette modérée par défaut. Réf : Aragon/Helms (lean bulk).
 * Purement indicatif : ne borne pas le curseur, il informe.
 */
export function recommendedGainRange(p: Pick<Profile, 'sex' | 'bodyFatPct'>): GainRange {
  const bf = p.bodyFatPct;
  if (typeof bf !== 'number' || bf <= 0 || bf >= 60) return { min: 0.2, max: 0.4, level: 'moderate', cutFirst: false };
  const highBf = p.sex === 'M' ? 20 : 28;
  const lowBf = p.sex === 'M' ? 12 : 22;
  if (bf > highBf) return { min: 0.1, max: 0.25, level: 'high', cutFirst: true };
  if (bf < lowBf) return { min: 0.25, max: 0.5, level: 'low', cutFirst: false };
  return { min: 0.2, max: 0.4, level: 'moderate', cutFirst: false };
}

/**
 * Cibles effectives du profil : respecte les valeurs manuelles si présentes,
 * sinon recalcule depuis TDEE et les paramètres g/kg.
 */
export function effectiveTargets(p: Profile, deficitKcal = 0): MacroTargets {
  const kcal = p.targetKcal ?? Math.round(tdee(p) - deficitKcal);
  if (p.targetProteinG != null && p.targetFatG != null && p.targetCarbsG != null) {
    return {
      kcal,
      protein: p.targetProteinG,
      fat: p.targetFatG,
      carbs: p.targetCarbsG
    };
  }
  return computeMacrosFromGrams(kcal, proteinTargetG(p, deficitKcal), fatTargetG(p, kcal));
}

/* =========================================================================
 *  Conversion cru / cuit
 *  cookedFactor = poids cuit / poids cru. Ex riz blanc ≈ 2.5, viande ≈ 0.7.
 *  Les macros de la base sont stockées sur le poids "state" (raw ou cooked).
 * ========================================================================= */

/** Ce qui suffit à convertir cru/cuit : utilisable pour un aliment seed comme perso. */
type Convertible = Pick<Food, 'state' | 'cookedFactor'>;

/** Convertit une quantité saisie en quantité équivalente dans l'état natif des macros. */
export function toNativeGrams(food: Convertible, grams: number, cooked: boolean): number {
  if (cooked === (food.state === 'cooked')) return grams;
  const factor = food.cookedFactor ?? 1;
  // Si la saisie est "cooked" et les macros sont "raw" → on divise par le facteur.
  // Si la saisie est "raw" et les macros sont "cooked" → on multiplie.
  return cooked && food.state === 'raw' ? grams / factor : grams * factor;
}

/** Inverse de `toNativeGrams` : des grammes natifs vers l'unité de saisie voulue. */
export function fromNativeGrams(food: Convertible, native: number, cooked: boolean): number {
  if (cooked === (food.state === 'cooked')) return native;
  const factor = food.cookedFactor ?? 1;
  return cooked && food.state === 'raw' ? native * factor : native / factor;
}

/* =========================================================================
 *  Agrégation des macros
 * ========================================================================= */

export interface MacroTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO_MACROS: MacroTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function macrosForItem(food: Food | undefined, item: MealItem): MacroTotals {
  // Repas pris à l'extérieur : les macros viennent de l'estimation, pas d'un aliment.
  if (item.estimate) {
    const e = item.estimate;
    return { kcal: e.kcal, protein: e.protein, carbs: e.carbs, fat: e.fat };
  }
  if (!food) return ZERO_MACROS;
  const grams = toNativeGrams(food, item.grams, item.cooked);
  const k = grams / 100;
  return {
    kcal: food.kcalPer100g * k,
    protein: food.proteinPer100g * k,
    carbs: food.carbsPer100g * k,
    fat: food.fatPer100g * k
  };
}

export function sumMacros(totals: MacroTotals[]): MacroTotals {
  return totals.reduce(
    (acc, t) => ({
      kcal: acc.kcal + t.kcal,
      protein: acc.protein + t.protein,
      carbs: acc.carbs + t.carbs,
      fat: acc.fat + t.fat
    }),
    { ...ZERO_MACROS }
  );
}
