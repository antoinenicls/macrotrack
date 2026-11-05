import { describe, it, expect } from 'vitest';
import { weeklyCoverage, planMacroGap, proteinMealBalance, mpsDoseG, NUTRIENT_META, NUTRIENT_ORDER } from '@/lib/coverage';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import { effectiveAllowedIds, substituteRotationToAllowed } from '@/lib/foodSelection';
import type { Food, Nutrient, PlanTemplateMeal } from '@/types';

const FOODS: Food[] = SEED_FOODS.map((f) => ({ ...f, createdAt: 0 }));
const MAP = new Map(FOODS.map((f) => [f.id, f]));
const byId = (id: string) => MAP.get(id);
const allIds = FOODS.map((f) => f.id);

/** Plan hebdo construit à partir d'une sélection d'aliments, comme le fait l'app. */
function planFor(selected: string[] | undefined) {
  const allowed = effectiveAllowedIds(selected, allIds);
  const rotation = substituteRotationToAllowed(SEED_WEEKLY_ROTATION, allowed, byId);
  return scaleRotationToTargets(rotation, 2450, 187, 76, byId);
}

const lineFor = (lines: ReturnType<typeof weeklyCoverage>, n: Nutrient) => lines.find((l) => l.nutrient === n)!;

describe('weeklyCoverage — la rotation curée tient ses promesses', () => {
  const lines = weeklyCoverage(planFor(undefined), byId, FOODS);

  it('couvre tous les micronutriments suivis', () => {
    const failing = lines.filter((l) => !l.ok).map((l) => l.nutrient);
    expect(failing).toEqual([]);
  });

  it('retourne une ligne par micronutriment, dans l’ordre d’affichage', () => {
    expect(lines.map((l) => l.nutrient)).toEqual([...NUTRIENT_ORDER]);
  });

  it('les oméga-3 tiennent exactement aux 2 jours de poisson gras promis', () => {
    expect(lineFor(lines, 'omega3').days).toBeGreaterThanOrEqual(NUTRIENT_META.omega3.minDaysPerWeek);
  });
});

describe('weeklyCoverage — détecte l’appauvrissement silencieux', () => {
  it('retirer les poissons fait tomber les oméga-3 alors que les macros sont intactes', () => {
    const noFish = allIds.filter((id) => id !== 'sardines-boite' && id !== 'thon-naturel');
    const plan = planFor(noFish);
    const lines = weeklyCoverage(plan, byId, FOODS, effectiveAllowedIds(noFish, allIds));
    const o3 = lineFor(lines, 'omega3');
    expect(o3.ok).toBe(false);
    expect(o3.days).toBe(0);
    // Les macros, elles, restent sur cible : c'est tout l'intérêt du bilan.
    const gap = planMacroGap(plan, byId, 2450, 187)!;
    expect(gap.kcalShort).toBe(0);
    expect(gap.proteinShort).toBe(0);
  });

  it('propose les sources manquantes parmi les aliments NON sélectionnés', () => {
    const noFish = allIds.filter((id) => id !== 'sardines-boite' && id !== 'thon-naturel');
    const lines = weeklyCoverage(planFor(noFish), byId, FOODS, effectiveAllowedIds(noFish, allIds));
    const ids = lineFor(lines, 'omega3').suggestions.map((f) => f.id);
    expect(ids).toContain('sardines-boite');
  });

  it('ne propose rien quand la sélection est implicite (tout est déjà autorisé)', () => {
    const lines = weeklyCoverage(planFor(undefined), byId, FOODS);
    expect(lines.every((l) => l.suggestions.length === 0)).toBe(true);
  });

  it('un profil végétalien perd la B12 (aucun aliment ne peut la couvrir)', () => {
    const vegan = allIds.filter((id) => !byId(id)!.nutrients?.includes('b12'));
    const lines = weeklyCoverage(planFor(vegan), byId, FOODS, effectiveAllowedIds(vegan, allIds));
    expect(lineFor(lines, 'b12').ok).toBe(false);
  });

  it('plan hebdo absent → aucune ligne (rien à dire)', () => {
    expect(weeklyCoverage(undefined, byId, FOODS)).toEqual([]);
    expect(weeklyCoverage({}, byId, FOODS)).toEqual([]);
  });
});

describe('weeklyCoverage — marqueurs d’un aliment perso', () => {
  it('un aliment ajouté par l’utilisateur compte dans le bilan', () => {
    const saumon: Food = {
      id: 'saumon-perso', name: 'Saumon', kcalPer100g: 200, proteinPer100g: 20, carbsPer100g: 0,
      fatPer100g: 13, category: 'proteine', isCustom: true, state: 'raw', nutrients: ['omega3'], createdAt: 0
    };
    const resolve = (id: string) => (id === saumon.id ? saumon : MAP.get(id));
    const plan: Record<string, PlanTemplateMeal[]> = {
      '1': [{ slot: 'dejeuner', items: [{ foodId: saumon.id, grams: 150, cooked: false }] }],
      '2': [{ slot: 'dejeuner', items: [{ foodId: saumon.id, grams: 150, cooked: false }] }]
    };
    const lines = weeklyCoverage(plan, resolve, [...FOODS, saumon]);
    expect(lineFor(lines, 'omega3').days).toBe(2);
  });

  it('une quantité symbolique ne suffit pas à couvrir la journée', () => {
    const plan: Record<string, PlanTemplateMeal[]> = {
      '1': [{ slot: 'dejeuner', items: [{ foodId: 'sardines-boite', grams: 10, cooked: true }] }]
    };
    expect(lineFor(weeklyCoverage(plan, byId, FOODS), 'omega3').days).toBe(0);
  });
});

describe('planMacroGap — dire quand la cible est hors d’atteinte', () => {
  it('la rotation curée n’affiche aucun manque', () => {
    const gap = planMacroGap(planFor(undefined), byId, 2450, 187)!;
    expect(gap.proteinShort).toBe(0);
    expect(gap.kcalShort).toBe(0);
  });

  it('une sélection végétarienne tient la cible (tofu + œufs + laitiers suffisent)', () => {
    const veg = allIds.filter((id) =>
      !['poulet-blanc-cru', 'steak-hache-5-cru', 'sardines-boite', 'thon-naturel'].includes(id));
    const gap = planMacroGap(planFor(veg), byId, 2450, 187)!;
    expect(gap.proteinShort).toBe(0);
  });

  it('une sélection vraiment pauvre en protéines ne peut pas tenir la cible', () => {
    // Une seule source de protéines, plafonnée à 6 œufs : 187 g est hors d'atteinte.
    const poor = ['oeuf-entier', 'riz-blanc-sec', 'brocoli', 'banane', 'huile-olive'];
    const gap = planMacroGap(planFor(poor), byId, 2450, 187)!;
    expect(gap.proteinShort).toBeGreaterThan(0);
  });

  it('plan absent → null', () => {
    expect(planMacroGap(undefined, byId, 2450, 187)).toBeNull();
  });
});

describe('proteinMealBalance — répartition sur la journée (MPS)', () => {
  // Aliment protéiné synthétique : 25 g P / 100 g, cru sans conversion (grammes natifs).
  const PROT: Food = {
    id: 'p', name: 'Prot', kcalPer100g: 100, proteinPer100g: 25, carbsPer100g: 0, fatPer100g: 0,
    category: 'proteine', isCustom: false, state: 'raw', createdAt: 0
  };
  const RESOLVE = (id: string): Food | undefined => (id === 'p' ? PROT : undefined);
  /** 1 jour, protéines par repas (g) → grammes de PROT (g = P×4). */
  const day = (perMeal: Partial<Record<PlanTemplateMeal['slot'], number>>): PlanTemplateMeal[] =>
    (Object.entries(perMeal) as [PlanTemplateMeal['slot'], number][])
      .map(([slot, p]) => ({ slot, items: [{ foodId: 'p', grams: p * 4, cooked: false }] }));

  it('mpsDoseG = 0,4 g/kg arrondi', () => {
    expect(mpsDoseG(84.85)).toBe(34);
    expect(mpsDoseG(60)).toBe(24);
  });

  it('chaque repas principal atteint la dose → ok, aucun sous-dosé', () => {
    const plan = { '1': day({ 'petit-dej': 45, 'dejeuner': 55, 'diner': 55, 'collation': 30 }) };
    const b = proteinMealBalance(plan, RESOLVE, 85)!;
    expect(b.doseG).toBe(34);
    expect(b.mainMealCount).toBe(3);
    expect(b.mainMealsReachingDose).toBe(3);
    expect(b.underDosed).toEqual([]);
    expect(b.ok).toBe(true);
    // La collation n'est pas soumise à la dose (repas non principal).
    expect(b.perMeal.find((m) => m.slot === 'collation')!.isMain).toBe(false);
  });

  it('un repas principal sous la dose → underDosed le liste, ok=false', () => {
    // Petit-déj à 10 g (sous 34), déjeuner/dîner copieux.
    const plan = { '1': day({ 'petit-dej': 10, 'dejeuner': 90, 'diner': 90 }) };
    const b = proteinMealBalance(plan, RESOLVE, 85)!;
    expect(b.underDosed).toEqual(['petit-dej']);
    expect(b.ok).toBe(false);
    expect(b.mainMealsReachingDose).toBe(2);
  });

  it('moyenne sur les jours du plan (pas la somme)', () => {
    const plan = {
      '1': day({ 'petit-dej': 40, 'dejeuner': 40, 'diner': 40 }),
      '2': day({ 'petit-dej': 40, 'dejeuner': 40, 'diner': 40 })
    };
    const b = proteinMealBalance(plan, RESOLVE, 85)!;
    // Deux jours identiques : la moyenne reste 40 g, pas 80.
    expect(b.perMeal.find((m) => m.slot === 'petit-dej')!.avgProteinG).toBe(40);
  });

  it('plan absent → null', () => {
    expect(proteinMealBalance(undefined, RESOLVE, 85)).toBeNull();
  });

  it('la rotation curée répartit bien les protéines (repas principaux à la dose)', () => {
    // Plan réel scalé à 187 g de protéines : les repas principaux doivent tenir la dose.
    const b = proteinMealBalance(planFor(undefined), byId, 84.85)!;
    expect(b.mainMealCount).toBeGreaterThanOrEqual(3);
    expect(b.mainMealsReachingDose).toBe(b.mainMealCount);
    expect(b.ok).toBe(true);
  });
});
