import { describe, it, expect } from 'vitest';
import { rebalanceForEstimates, pendingSlots, MAX_SHARE, DEFAULT_CARRY, carrySettingsOf, carryOverFor, carryPerDay, applyCarryOver, reduceTargets, planKcal } from '../estimateRebalance';
import { buildTrainingDayPlan, itemsTotals, PRE_WORKOUT_ITEMS } from '../trainingDay';
import { SEED_WEEKLY_ROTATION } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import { estimateFor, EATEN_OUT_FOOD_ID } from '@/data/eatenOut';
import type { EatenOutCategory, Food, Meal, MealSlot, PlanTemplateMeal } from '@/types';

const byId = (id: string) => SEED_FOODS.find((f) => f.id === id) as Food | undefined;
const kcalOf = (day: PlanTemplateMeal[]) => itemsTotals(day.flatMap((m) => m.items), byId).kcal;
const proteinOf = (day: PlanTemplateMeal[]) => itemsTotals(day.flatMap((m) => m.items), byId).protein;
const slotKcal = (day: PlanTemplateMeal[], slot: MealSlot) => itemsTotals(day.find((m) => m.slot === slot)?.items ?? [], byId).kcal;
const flex = (id: string) => ['glucide', 'lipide'].includes(byId(id)?.category ?? '');

const monday = SEED_WEEKLY_ROTATION['1'];

/** Petit-déj mangé tel que prévu, déjeuner estimé, dîner et collation à venir. */
function dayWith(category: EatenOutCategory, rebalanceSlots: MealSlot[] | null = ['diner', 'collation']): Meal[] {
  const breakfast = monday.find((m) => m.slot === 'petit-dej')!;
  return [
    { id: 'b', date: 'd', slot: 'petit-dej', createdAt: 0, items: breakfast.items.map((it) => ({ ...it, fromTemplate: true })) },
    { id: 'l', date: 'd', slot: 'dejeuner', createdAt: 0, items: [{ foodId: EATEN_OUT_FOOD_ID, grams: 0, cooked: false, estimate: { ...estimateFor(category), rebalanceSlots: rebalanceSlots ?? undefined } }] }
  ];
}

describe('rebalanceForEstimates', () => {
  it('sans repas estimé : plan inchangé', () => {
    const out = rebalanceForEstimates(monday, [], byId);
    expect(out.plan).toBe(monday);
    expect(out.adjustedSlots).toEqual([]);
  });

  it('repas plus lourd : le reste compense, protéines et repas déjà mangés intacts', () => {
    const meals = dayWith('main-copieux');
    const out = rebalanceForEstimates(monday, meals, byId);
    expect(out.deltaKcal).toBeGreaterThan(0);
    expect(out.adjustedKcal).toBeLessThan(0);
    // Journée (prévu hors déjeuner + estimation) recalée sur la cible, au surplus non compensable près.
    const day = kcalOf(out.plan) - slotKcal(out.plan, 'dejeuner') + estimateFor('main-copieux').kcal;
    expect(Math.abs(day - out.uncompensatedKcal - kcalOf(monday))).toBeLessThan(25);
    expect(out.plan.find((m) => m.slot === 'petit-dej')).toEqual(monday.find((m) => m.slot === 'petit-dej'));
    // Aliments protéinés intacts (seuls féculents et gras bougent, avec leurs quelques protéines).
    const proteinFoods = (d: PlanTemplateMeal[]) => d.flatMap((m) => m.items).filter((it) => byId(it.foodId)?.category === 'proteine');
    expect(proteinFoods(out.plan)).toEqual(proteinFoods(monday));
    expect(proteinOf(out.plan)).toBeGreaterThan(proteinOf(monday) - 12);
  });

  it('gros écart : plancher de 60 % par portion et surplus signalé', () => {
    const out = rebalanceForEstimates(monday, dayWith('main-fastfood'), byId);
    for (const m of out.plan) {
      const base = monday.find((b) => b.slot === m.slot)!;
      for (const it of m.items) {
        const b = base.items.find((x) => x.foodId === it.foodId)!;
        if (flex(it.foodId)) expect(it.grams).toBeGreaterThanOrEqual(Math.floor(b.grams * 0.55));
      }
    }
    expect(out.uncompensatedKcal).toBeGreaterThan(0);
  });

  it('repas plus léger : on ne rajoute que la moitié de l\'écart, plafonné', () => {
    const out = rebalanceForEstimates(monday, dayWith('main-leger'), byId);
    expect(out.deltaKcal).toBeLessThan(0);
    expect(out.adjustedKcal).toBeGreaterThan(0);
    expect(out.adjustedKcal).toBeLessThanOrEqual(Math.ceil(-out.deltaKcal / 2) + 25);
    for (const m of out.plan) {
      const base = monday.find((b) => b.slot === m.slot)!;
      for (const it of m.items) {
        const b = base.items.find((x) => x.foodId === it.foodId)!;
        expect(it.grams).toBeLessThanOrEqual(Math.ceil(b.grams * MAX_SHARE) + 15);
      }
    }
    expect(out.uncompensatedKcal).toBe(0);
  });

  it('cocher un repas recalé ne fait pas bouger les autres portions', () => {
    const before = rebalanceForEstimates(monday, dayWith('main-copieux'), byId);
    const dinner = before.plan.find((m) => m.slot === 'diner')!;
    const meals = [...dayWith('main-copieux'), { id: 'd', date: 'd', slot: 'diner' as const, createdAt: 0, items: dinner.items.map((it) => ({ ...it, fromTemplate: true })) }];
    expect(rebalanceForEstimates(monday, meals, byId).plan).toEqual(before.plan);
  });

  it('seuls les repas figés dans l\'estimation bougent (anciennes estimations : aucun)', () => {
    const onlyDinner = rebalanceForEstimates(monday, dayWith('main-copieux', ['diner']), byId);
    expect(onlyDinner.adjustedSlots).toEqual(['diner']);
    expect(rebalanceForEstimates(monday, dayWith('main-copieux', null), byId).adjustedSlots).toEqual([]);
  });

  it('jour de séance : le bloc pré-training reste tel quel', () => {
    const training = buildTrainingDayPlan(monday, byId);
    const out = rebalanceForEstimates(training, dayWith('main-copieux'), byId);
    const collation = out.plan.find((m) => m.slot === 'collation')!.items;
    for (const b of PRE_WORKOUT_ITEMS) expect(collation).toContainEqual(b);
  });

  it('protéines manquantes signalées vs le repas prévu', () => {
    const out = rebalanceForEstimates(monday, dayWith('snack-gourmand' as EatenOutCategory), byId);
    const planned = itemsTotals(monday.find((m) => m.slot === 'dejeuner')!.items, byId).protein;
    expect(out.proteinGapG).toBe(Math.max(0, Math.round(planned - estimateFor('snack-gourmand').protein)));
  });
});

describe('pendingSlots', () => {
  it('repas du plan sans rien de logué, hors créneau estimé', () => {
    const breakfast = monday.find((m) => m.slot === 'petit-dej')!;
    const meals: Meal[] = [{ id: 'b', date: 'd', slot: 'petit-dej', createdAt: 0, items: [{ ...breakfast.items[0], fromTemplate: true }] }];
    const expected = monday.map((m) => m.slot).filter((s) => s !== 'petit-dej' && s !== 'dejeuner');
    expect(pendingSlots(monday, meals, 'dejeuner')).toEqual(expected);
  });
});

describe('report du surplus non compensable', () => {
  const day = 2400;

  it('réparti sur les 2 jours suivants, plafonné à 10 % de la journée', () => {
    const surplus = { '2026-10-20': 400 };
    expect(carryOverFor('2026-10-21', surplus, day)).toBe(200);
    expect(carryOverFor('2026-10-22', surplus, day)).toBe(200);
    expect(carryOverFor('2026-10-23', surplus, day)).toBe(0);
    expect(carryOverFor('2026-10-20', surplus, day)).toBe(0);
    expect(carryOverFor('2026-10-21', { '2026-10-20': 900 }, day)).toBe(240);
    expect(carryPerDay(900, day)).toBe(240);
  });

  it('rien sous 150 kcal', () => {
    expect(carryOverFor('2026-10-21', { '2026-10-20': 140 }, day)).toBe(0);
    expect(carryPerDay(140, day)).toBe(0);
  });

  it('deux écarts de suite : le plafond tient', () => {
    expect(carryOverFor('2026-10-22', { '2026-10-20': 400, '2026-10-21': 400 }, day)).toBe(240);
  });

  it('retiré des féculents et du gras seulement', () => {
    const out = applyCarryOver(monday, 200, byId);
    expect(planKcal(monday, byId) - planKcal(out, byId)).toBeGreaterThan(160);
    expect(planKcal(monday, byId) - planKcal(out, byId)).toBeLessThan(240);
    const proteinFoods = (d: PlanTemplateMeal[]) => d.flatMap((m) => m.items).filter((it) => !flex(it.foodId));
    expect(proteinFoods(out)).toEqual(proteinFoods(monday));
  });

  it('cibles allégées : protéines intactes, glucides et lipides au prorata', () => {
    const t = reduceTargets({ kcal: 2400, protein: 190, carbs: 250, fat: 70 }, 200);
    expect(t.kcal).toBe(2200);
    expect(t.protein).toBe(190);
    expect(Math.abs(t.carbs * 4 + t.fat * 9 - (250 * 4 + 70 * 9 - 200))).toBeLessThan(10);
  });
});

describe('réglages du report', () => {
  const day = 2400;
  const surplus = { '2026-10-20': 400 };

  it('désactivé : rien n\'est reporté', () => {
    const off = carrySettingsOf({ estimateCarry: { enabled: false } });
    expect(carryOverFor('2026-10-21', surplus, day, off)).toBe(0);
    expect(carryPerDay(400, day, off)).toBe(0);
  });

  it('jours, seuil et plafond personnalisés', () => {
    const cfg = { ...DEFAULT_CARRY, days: 3, minKcal: 300, maxShare: 0.05 };
    expect(carryOverFor('2026-10-23', surplus, day, cfg)).toBe(120); // 400/3 plafonné à 5 % de 2400
    expect(carryOverFor('2026-10-24', surplus, day, cfg)).toBe(0);
    expect(carryOverFor('2026-10-21', { '2026-10-20': 250 }, day, cfg)).toBe(0); // sous le seuil
  });

  it('réglages absents ou partiels : complétés par les valeurs recommandées', () => {
    expect(carrySettingsOf(undefined)).toEqual(DEFAULT_CARRY);
    expect(carrySettingsOf({ estimateCarry: { days: 1 } })).toEqual({ ...DEFAULT_CARRY, days: 1 });
  });
});
