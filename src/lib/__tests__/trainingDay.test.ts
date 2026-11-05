import { describe, it, expect } from 'vitest';
import { buildTrainingDayPlan, itemsTotals, PRE_WORKOUT_ITEMS, isTrainingDay, pendingTrainingItems } from '../trainingDay';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import type { Food, PlanTemplateMeal } from '@/types';

const byId = (id: string) => SEED_FOODS.find((f) => f.id === id) as Food | undefined;
const all = (day: PlanTemplateMeal[]) => day.flatMap((m) => m.items);
const collation = (day: PlanTemplateMeal[]) => day.find((m) => m.slot === 'collation')!.items;

describe('buildTrainingDayPlan', () => {
  const monday = SEED_WEEKLY_ROTATION['1'];
  const out = buildTrainingDayPlan(monday, byId);

  it('collation = protéines et oléagineux gardés + bloc pré-training aux quantités exactes', () => {
    const ids = collation(out).map((i) => i.foodId);
    expect(ids).toContain('fromage-blanc-0');
    expect(ids).toContain('whey');
    expect(ids).toContain('beurre-cacahuete');
    expect(ids).toContain('amandes');
    expect(ids).not.toContain('fruits-rouges-surgeles');
    for (const b of PRE_WORKOUT_ITEMS) {
      expect(collation(out)).toContainEqual(b);
    }
  });

  it('calories et protéines du jour inchangées, lipides seulement un peu réduits', () => {
    const before = itemsTotals(all(monday), byId);
    const after = itemsTotals(all(out), byId);
    expect(Math.abs(after.kcal - before.kcal)).toBeLessThan(40);
    expect(Math.abs(after.protein - before.protein)).toBeLessThan(6);
    expect(after.fat).toBeGreaterThan(before.fat * 0.8);
  });

  // Régression : sur une cible de sèche basse, toute la compensation portait sur les
  // féculents, qui tombaient à 1-8 g (riz, pâtes, flocons).
  it.each([2450, 2200, 1900])('cible %i kcal : aucun féculent ni gras sous 60 %% de sa portion', (kcal) => {
    const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, kcal, 187, Math.round(kcal / 32), byId);
    for (const day of Object.values(scaled)) {
      const tr = buildTrainingDayPlan(day, byId);
      const grams = (d: PlanTemplateMeal[], id: string, slot: string) =>
        d.find((m) => m.slot === slot)?.items.find((i) => i.foodId === id)?.grams ?? 0;
      for (const m of day) {
        if (m.slot === 'collation') continue;
        for (const it of m.items) {
          const cat = byId(it.foodId)?.category;
          if (cat !== 'glucide' && cat !== 'lipide') continue;
          expect(grams(tr, it.foodId, m.slot)).toBeGreaterThanOrEqual(Math.floor(it.grams * 0.55));
        }
      }
      // Calories : égales, ou un léger dépassement quand le plancher ne suffit pas.
      const before = itemsTotals(all(day), byId).kcal;
      const after = itemsTotals(all(tr), byId).kcal;
      expect(after - before).toBeGreaterThan(-40);
      expect(after - before).toBeLessThan(160);
    }
  });

  it("ne gonfle pas l'huile pour compenser les oléagineux retirés", () => {
    const oil = (d: PlanTemplateMeal[]) => all(d).filter((i) => i.foodId === 'huile-olive').reduce((s, i) => s + i.grams, 0);
    expect(oil(out)).toBeLessThanOrEqual(oil(monday) * 1.3);
  });

  it('crée la collation si le jour n’en a pas, et écarte un aliment bloqué', () => {
    const noSnack = monday.filter((m) => m.slot !== 'collation');
    const r = buildTrainingDayPlan(noSnack, byId, (id) => id === 'miel-fleurs');
    const ids = collation(r).map((i) => i.foodId);
    expect(ids).toEqual(['galettes-riz-complet', 'banane']);
  });
});

describe('liste de courses : séances à prévoir', () => {
  it('reconnaît une journée de séance à son bloc pré-training', () => {
    expect(isTrainingDay(SEED_WEEKLY_ROTATION['1'])).toBe(false);
    expect(isTrainingDay(buildTrainingDayPlan(SEED_WEEKLY_ROTATION['1'], byId))).toBe(true);
  });

  it('prévoit le bloc pour les séances restantes seulement', () => {
    const items = pendingTrainingItems(3, 1);
    expect(items).toEqual(PRE_WORKOUT_ITEMS.map((it) => ({ ...it, grams: it.grams * 2 })));
    expect(pendingTrainingItems(3, 3)).toEqual([]);
    expect(pendingTrainingItems(2, 4)).toEqual([]);
    expect(pendingTrainingItems(0, 0)).toEqual([]);
  });
});
