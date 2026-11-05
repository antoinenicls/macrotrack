import { describe, it, expect } from 'vitest';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import { macrosForItem } from '@/lib/nutrition';
import type { Food, PlanTemplateMeal } from '@/types';

const FOOD = new Map<string, Food>(SEED_FOODS.map((f) => [f.id, { ...f, createdAt: 0 }]));

function dayTotals(meals: PlanTemplateMeal[], resolve: (id: string) => Food | undefined = (id) => FOOD.get(id)) {
  let kcal = 0, protein = 0, fat = 0, carbs = 0;
  for (const m of meals) {
    for (const it of m.items) {
      const mm = macrosForItem(resolve(it.foodId), { foodId: it.foodId, grams: it.grams, cooked: it.cooked });
      kcal += mm.kcal; protein += mm.protein; fat += mm.fat; carbs += mm.carbs;
    }
  }
  return { kcal, protein, fat, carbs };
}

/** Somme des grammes des items "figés" (légumes/fruits/autre) d’un jour. */
function fixedGrams(meals: PlanTemplateMeal[]): number {
  let g = 0;
  for (const m of meals) for (const it of m.items) {
    const c = FOOD.get(it.foodId)?.category;
    if (c === 'legume' || c === 'fruit' || c === 'autre') g += it.grams;
  }
  return g;
}

describe('scaleRotationToTargets — atteint les cibles par jour', () => {
  const cases = [
    { label: 'cible de référence', kcal: 2450, p: 187, f: 76 },
    { label: 'sèche forte (down)',  kcal: 2050, p: 187, f: 76 },
    { label: 'surplus (up)',        kcal: 3000, p: 200, f: 85 }
  ];

  for (const c of cases) {
    it(`${c.label} : chaque jour ≈ ${c.kcal} kcal / ${c.p}P / ${c.f}L`, () => {
      const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, c.kcal, c.p, c.f);
      for (const [day, meals] of Object.entries(scaled)) {
        const t = dayTotals(meals);
        expect(Math.abs(t.kcal - c.kcal), `jour ${day} kcal`).toBeLessThan(40);
        expect(Math.abs(t.protein - c.p), `jour ${day} P`).toBeLessThan(5);
        expect(Math.abs(t.fat - c.f), `jour ${day} L`).toBeLessThan(5);
      }
    });
  }

  it('garde les légumes & fruits FIGÉS (mêmes grammes) en sèche', () => {
    const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2050, 187, 76);
    for (const day of Object.keys(SEED_WEEKLY_ROTATION)) {
      expect(fixedGrams(scaled[day])).toBe(fixedGrams(SEED_WEEKLY_ROTATION[day]));
    }
  });

  it('protéines tenues sur cible quand on durcit le déficit (muscle préservé)', () => {
    const soft = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2450, 187, 76);
    const hard = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2050, 187, 76);
    // À iso-protéines visées, la protéine reste ~187 dans les deux ; ce sont les
    // glucides qui chutent.
    for (const day of Object.keys(soft)) {
      expect(Math.abs(dayTotals(hard[day]).protein - 187)).toBeLessThan(5);
      expect(dayTotals(hard[day]).carbs).toBeLessThan(dayTotals(soft[day]).carbs);
    }
  });

  it('ne produit jamais de grammes ≤ 0', () => {
    const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 1600, 187, 76);
    for (const meals of Object.values(scaled))
      for (const m of meals) for (const it of m.items)
        expect(it.grams).toBeGreaterThanOrEqual(1);
  });
});

describe('scaleRotationToTargets — aliments hors seed (perso ou édités)', () => {
  // Escalope de dinde ajoutée par l'utilisateur : elle n'existe QUE dans sa base locale.
  const DINDE: Food = {
    id: 'dinde-perso', name: 'Escalope de dinde', kcalPer100g: 105, proteinPer100g: 24,
    carbsPer100g: 0, fatPer100g: 1, category: 'proteine', isCustom: true, state: 'raw', createdAt: 0
  };
  const resolve = (id: string): Food | undefined => (id === DINDE.id ? DINDE : FOOD.get(id));

  /** Rotation où le poulet a été remplacé par l'aliment perso. */
  const withCustom = (): Record<string, PlanTemplateMeal[]> =>
    Object.fromEntries(Object.entries(SEED_WEEKLY_ROTATION).map(([day, meals]) => [
      day,
      meals.map((m) => ({
        slot: m.slot,
        items: m.items.map((it) => (it.foodId === 'poulet-blanc-cru' ? { ...it, foodId: DINDE.id } : it))
      }))
    ]));

  it('avec résolveur : la cible est atteinte malgré l’aliment perso', () => {
    const scaled = scaleRotationToTargets(withCustom(), 2450, 187, 76, resolve);
    for (const [day, meals] of Object.entries(scaled)) {
      const t = dayTotals(meals, resolve);
      expect(Math.abs(t.kcal - 2450), `jour ${day} kcal`).toBeLessThan(40);
      expect(Math.abs(t.protein - 187), `jour ${day} P`).toBeLessThan(5);
    }
  });

  it('sans résolveur, l’aliment perso compte pour 0 et le jour dérive (régression)', () => {
    // Garde-fou : documente pourquoi le résolveur DOIT être passé par les appelants.
    const rotation = withCustom();
    const blind = scaleRotationToTargets(rotation, 2450, 187, 76);
    const days = Object.keys(rotation).filter((d) =>
      rotation[d].some((m) => m.items.some((it) => it.foodId === DINDE.id))
    );
    expect(days.length).toBeGreaterThan(0);
    const worst = Math.max(...days.map((d) => Math.abs(dayTotals(blind[d], resolve).kcal - 2450)));
    expect(worst).toBeGreaterThan(100);
  });

  it('prend en compte des macros ÉDITÉES par l’utilisateur', () => {
    // Même id que le seed, mais l'utilisateur a corrigé les valeurs de son riz.
    const edited: Food = { ...FOOD.get('riz-blanc-sec')!, kcalPer100g: 300, carbsPer100g: 65, isCustom: true };
    const withEdit = (id: string) => (id === edited.id ? edited : FOOD.get(id));
    const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2450, 187, 76, withEdit);
    for (const [day, meals] of Object.entries(scaled)) {
      expect(Math.abs(dayTotals(meals, withEdit).kcal - 2450), `jour ${day}`).toBeLessThan(40);
    }
  });
});

describe('scaleRotationToTargets — plafonds de portion', () => {
  /** Journée volontairement pauvre : un seul féculent doit absorber tout l'écart. */
  const poor: Record<string, PlanTemplateMeal[]> = {
    '1': [
      { slot: 'dejeuner', items: [
        { foodId: 'poulet-blanc-cru', grams: 150, cooked: false },
        { foodId: 'riz-blanc-sec',    grams: 60,  cooked: false },
        { foodId: 'brocoli',          grams: 150, cooked: true }
      ]}
    ]
  };

  it('ne dépasse jamais le plafond de l’aliment, même si la cible l’exige', () => {
    const scaled = scaleRotationToTargets(poor, 3500, 180, 70);
    const riz = scaled['1'][0].items.find((it) => it.foodId === 'riz-blanc-sec')!;
    const max = SEED_FOODS.find((f) => f.id === 'riz-blanc-sec')!.portionMaxG!;
    expect(riz.grams).toBeLessThanOrEqual(max);
  });

  it('plafonne aussi quand l’item est saisi en CUIT (conversion vers l’unité de l’item)', () => {
    const cooked: Record<string, PlanTemplateMeal[]> = {
      '1': [{ slot: 'dejeuner', items: [
        { foodId: 'poulet-blanc-cru', grams: 105, cooked: true },
        { foodId: 'riz-blanc-sec',    grams: 150, cooked: true },
        { foodId: 'brocoli',          grams: 150, cooked: true }
      ]}]
    };
    const scaled = scaleRotationToTargets(cooked, 3500, 180, 70);
    const riz = scaled['1'][0].items.find((it) => it.foodId === 'riz-blanc-sec')!;
    const max = SEED_FOODS.find((f) => f.id === 'riz-blanc-sec')!.portionMaxG!;
    // 150 g cuits ≈ 60 g secs : le plafond porte sur le SEC (facteur 2,5).
    expect(riz.grams / 2.5).toBeLessThanOrEqual(max + 0.5);
  });

  it('le plafond porte sur le TOTAL du jour, pas sur chaque occurrence', () => {
    // Trois repas d'œufs : individuellement sous le plafond, ensemble bien au-dessus.
    const spread: Record<string, PlanTemplateMeal[]> = {
      '1': [
        { slot: 'petit-dej', items: [{ foodId: 'oeuf-entier', grams: 150, cooked: false }] },
        { slot: 'dejeuner',  items: [{ foodId: 'oeuf-entier', grams: 150, cooked: false }, { foodId: 'brocoli', grams: 150, cooked: true }] },
        { slot: 'diner',     items: [{ foodId: 'oeuf-entier', grams: 150, cooked: false }] }
      ]
    };
    const scaled = scaleRotationToTargets(spread, 3500, 250, 90);
    const total = scaled['1'].flatMap((m) => m.items)
      .filter((it) => it.foodId === 'oeuf-entier')
      .reduce((s, it) => s + it.grams, 0);
    const max = SEED_FOODS.find((f) => f.id === 'oeuf-entier')!.portionMaxG!;
    expect(total).toBeLessThanOrEqual(max);
  });

  it('ne change rien quand la cible reste plausible', () => {
    const normal = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2450, 187, 76);
    for (const [day, meals] of Object.entries(normal)) {
      expect(Math.abs(dayTotals(meals).kcal - 2450), `jour ${day}`).toBeLessThan(40);
    }
  });
});
