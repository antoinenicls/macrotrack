import { describe, it, expect } from 'vitest';
import {
  activeSlotsOf, matchingMealPreset, applyMealStructureToDay, applyMealStructure, MEAL_PRESETS
} from '@/lib/mealStructure';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import { macrosForItem } from '@/lib/nutrition';
import { MEAL_SLOTS, type Food, type MealSlot, type PlanTemplateMeal } from '@/types';

const FOODS: Food[] = SEED_FOODS.map((f) => ({ ...f, createdAt: 0 }));
const MAP = new Map(FOODS.map((f) => [f.id, f]));
const byId = (id: string) => MAP.get(id);
const preset = (id: string) => MEAL_PRESETS.find((p) => p.id === id)!;

function totals(meals: PlanTemplateMeal[]) {
  let kcal = 0, protein = 0, fat = 0, carbs = 0;
  for (const m of meals) for (const it of m.items) {
    const mm = macrosForItem(byId(it.foodId), it);
    kcal += mm.kcal; protein += mm.protein; fat += mm.fat; carbs += mm.carbs;
  }
  return { kcal, protein, fat, carbs };
}

const day: PlanTemplateMeal[] = [
  { slot: 'petit-dej', items: [{ foodId: 'oeuf-entier', grams: 150, cooked: false }, { foodId: 'banane', grams: 110, cooked: false }] },
  { slot: 'dejeuner', items: [{ foodId: 'poulet-blanc-cru', grams: 126, cooked: true }, { foodId: 'riz-blanc-sec', grams: 225, cooked: true }] },
  { slot: 'diner', items: [{ foodId: 'steak-hache-5-cru', grams: 113, cooked: true }] },
  { slot: 'collation', items: [{ foodId: 'fromage-blanc-0', grams: 250, cooked: false }, { foodId: 'banane', grams: 110, cooked: false }] }
];

describe('activeSlotsOf', () => {
  it('absent → les quatre repas', () => {
    expect(activeSlotsOf(undefined)).toEqual([...MEAL_SLOTS]);
  });
  it('conserve l’ordre chronologique quel que soit l’ordre donné', () => {
    expect(activeSlotsOf(['collation', 'petit-dej'])).toEqual(['petit-dej', 'collation']);
  });
  it('une liste vide retombe sur les quatre (une journée sans repas n’existe pas)', () => {
    expect(activeSlotsOf([])).toEqual([...MEAL_SLOTS]);
  });
});

describe('matchingMealPreset', () => {
  it('reconnaît le jeûne 16/8 et les 3 repas', () => {
    expect(matchingMealPreset(['dejeuner', 'diner', 'collation'])?.id).toBe('jeune-16-8');
    expect(matchingMealPreset(['petit-dej', 'dejeuner', 'diner'])?.id).toBe('trois');
    expect(matchingMealPreset(undefined)?.id).toBe('quatre');
  });
  it('une structure inhabituelle ne correspond à aucun préréglage', () => {
    expect(matchingMealPreset(['petit-dej', 'collation'])).toBeUndefined();
  });
});

describe('applyMealStructureToDay — reverser sans rien perdre', () => {
  it('jeûne 16/8 : le petit-déjeuner part dans le déjeuner', () => {
    const out = applyMealStructureToDay(day, [...preset('jeune-16-8').slots]);
    expect(out.map((m) => m.slot)).toEqual(['dejeuner', 'diner', 'collation']);
    const dej = out.find((m) => m.slot === 'dejeuner')!;
    expect(dej.items.map((i) => i.foodId)).toContain('oeuf-entier');
  });

  it('sans collation : elle part dans le dîner', () => {
    const out = applyMealStructureToDay(day, [...preset('trois').slots]);
    const diner = out.find((m) => m.slot === 'diner')!;
    expect(diner.items.map((i) => i.foodId)).toContain('fromage-blanc-0');
  });

  it('les macros de la journée sont RIGOUREUSEMENT inchangées', () => {
    for (const p of MEAL_PRESETS) {
      const out = applyMealStructureToDay(day, [...p.slots]);
      const a = totals(day);
      const b = totals(out);
      expect(b.kcal, p.label).toBeCloseTo(a.kcal, 6);
      expect(b.protein, p.label).toBeCloseTo(a.protein, 6);
      expect(b.fat, p.label).toBeCloseTo(a.fat, 6);
      expect(b.carbs, p.label).toBeCloseTo(a.carbs, 6);
    }
  });

  it('reverse vers le repas le PLUS PROCHE, pas vers un seul fourre-tout', () => {
    // En 2 repas : le petit-déj rejoint le déjeuner, la collation rejoint le dîner.
    const out = applyMealStructureToDay(day, [...preset('deux').slots]);
    expect(out.find((m) => m.slot === 'dejeuner')!.items.map((i) => i.foodId)).toContain('oeuf-entier');
    expect(out.find((m) => m.slot === 'diner')!.items.map((i) => i.foodId)).toContain('fromage-blanc-0');
  });

  it('fusionne le même aliment quand il atterrit deux fois dans le même repas', () => {
    // Un seul repas actif : les deux bananes (petit-déj + collation) se rejoignent.
    const out = applyMealStructureToDay(day, ['dejeuner']);
    const bananes = out.flatMap((m) => m.items).filter((i) => i.foodId === 'banane');
    expect(bananes).toHaveLength(1);
    expect(bananes[0].grams).toBe(220);
  });

  it('ne fusionne pas deux saisies d’unités différentes (cru vs cuit)', () => {
    const mixed: PlanTemplateMeal[] = [
      { slot: 'petit-dej', items: [{ foodId: 'poulet-blanc-cru', grams: 100, cooked: false }] },
      { slot: 'dejeuner', items: [{ foodId: 'poulet-blanc-cru', grams: 100, cooked: true }] },
      { slot: 'diner', items: [] },
      { slot: 'collation', items: [] }
    ];
    const out = applyMealStructureToDay(mixed, ['dejeuner', 'diner']);
    const poulets = out.flatMap((m) => m.items).filter((i) => i.foodId === 'poulet-blanc-cru');
    expect(poulets).toHaveLength(2);
  });

  it('structure complète → plan rendu tel quel', () => {
    expect(applyMealStructureToDay(day, [...MEAL_SLOTS])).toBe(day);
    expect(applyMealStructure({ '1': day }, undefined)).toEqual({ '1': day });
  });
});

describe('sur la vraie rotation calibrée', () => {
  const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2450, 187, 76, byId);

  for (const p of MEAL_PRESETS) {
    it(`${p.label} : chaque jour garde ses calories et ses protéines`, () => {
      const out = applyMealStructure(scaled, [...p.slots] as MealSlot[]);
      for (const [dayKey, meals] of Object.entries(out)) {
        const a = totals(scaled[dayKey]);
        const b = totals(meals);
        expect(b.kcal, `jour ${dayKey}`).toBeCloseTo(a.kcal, 6);
        expect(b.protein, `jour ${dayKey}`).toBeCloseTo(a.protein, 6);
        expect(meals.map((m) => m.slot)).toEqual([...p.slots]);
      }
    });
  }
});
