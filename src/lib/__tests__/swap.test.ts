import { describe, it, expect } from 'vitest';
import { equivalentGrams, swapCookedFlag, swapCandidates, applyFoodSwaps, swapInDayPlan } from '@/lib/swap';
import { SEED_FOODS } from '@/data/seedFoods';
import { macrosForItem } from '@/lib/nutrition';
import type { Food, PlanTemplateMeal } from '@/types';

const FOODS: Food[] = SEED_FOODS.map((f) => ({ ...f, createdAt: 0 }));
const MAP = new Map(FOODS.map((f) => [f.id, f]));
const byId = (id: string) => MAP.get(id);
const food = (id: string) => MAP.get(id)!;

const kcalOf = (f: Food, grams: number, cooked: boolean) =>
  macrosForItem(f, { foodId: f.id, grams, cooked }).kcal;

describe('equivalentGrams — grammage de remplacement', () => {
  it('remplacer un aliment par lui-même redonne la même quantité', () => {
    const poulet = food('poulet-blanc-cru');
    expect(equivalentGrams(poulet, 180, false, poulet, false)).toBe(180);
  });

  it('une conserve est proposée en boîtes entières, pas en grammes bricolés', () => {
    const poulet = food('poulet-blanc-cru');
    const thon = food('thon-naturel');
    // L'équivalence protéique donne ~159 g ; on sert 1 boîte, pas 1,2 boîte.
    const g = equivalentGrams(poulet, 180, false, thon, true);
    expect(g % thon.portionStepG!).toBe(0);
    expect(g).toBe(130);
  });

  it('ne propose jamais un tiers de banane', () => {
    // Cas signalé : remplacer un kiwi par « 53 g de banane » n'existe pas.
    const g = equivalentGrams(food('kiwi'), 80, false, food('banane'), false);
    expect(g).toBe(55); // ½ banane
  });

  it('un échange de féculents conserve les CALORIES (levier calorique de la journée)', () => {
    const riz = food('riz-blanc-sec');
    const pates = food('pates-completes-sec');
    const g = equivalentGrams(riz, 90, false, pates, false);
    const before = kcalOf(riz, 90, false);
    const after = kcalOf(pates, g, false);
    expect(Math.abs(after - before)).toBeLessThan(before * 0.02);
  });

  it('un échange de protéines conserve les PROTÉINES, pas les calories', () => {
    // Caler sur les calories effondrerait la protéine (41 g → 17 g avec des œufs).
    const poulet = food('poulet-blanc-cru');
    const fb = food('fromage-blanc-0');
    const g = equivalentGrams(poulet, 180, false, fb, false);
    const before = macrosForItem(poulet, { foodId: poulet.id, grams: 180, cooked: false });
    const after = macrosForItem(fb, { foodId: fb.id, grams: g, cooked: false });
    expect(Math.abs(after.protein - before.protein)).toBeLessThan(1);
    // Les calories, elles, bougent nettement : c'est le compromis assumé.
    expect(Math.abs(after.kcal - before.kcal)).toBeGreaterThan(20);
  });

  it('le plafond de portion prime sur l’équivalence protéique', () => {
    // 180 g de poulet valent 331 g d’œufs : au-delà du plafond (300 g = 6 œufs).
    const oeuf = food('oeuf-entier');
    const g = equivalentGrams(food('poulet-blanc-cru'), 180, false, oeuf, false);
    expect(g).toBe(oeuf.portionMaxG);
  });

  it('un échange de légumes conserve le VOLUME (satiété), pas les calories', () => {
    const g = equivalentGrams(food('brocoli'), 200, true, food('carottes'), false);
    expect(g).toBe(200);
  });

  it('respecte le plafond de portion de l’aliment de remplacement', () => {
    const fb = food('fromage-blanc-0');
    const whey = food('whey');
    // 600 g de fromage blanc = 48 g de protéines ; la whey plafonne à 60 g.
    const g = equivalentGrams(fb, 600, false, whey, false);
    expect(g).toBeLessThanOrEqual(whey.portionMaxG!);
  });

  it('un aliment sans macros ne provoque pas de division par zéro', () => {
    const eau: Food = {
      id: 'eau', name: 'Eau', kcalPer100g: 0, proteinPer100g: 0, carbsPer100g: 0, fatPer100g: 0,
      category: 'autre', isCustom: true, state: 'raw', createdAt: 0
    };
    expect(equivalentGrams(food('banane'), 110, false, eau, false)).toBe(110);
  });

  it('convertit correctement quand l’original est pesé CUIT', () => {
    const poulet = food('poulet-blanc-cru');   // cf 0.7, 126 g cuit = 180 g cru
    const steak = food('steak-hache-5-cru');
    const g = equivalentGrams(poulet, 126, true, steak, true);
    const before = macrosForItem(poulet, { foodId: poulet.id, grams: 126, cooked: true }).protein;
    const after = macrosForItem(steak, { foodId: steak.id, grams: g, cooked: true }).protein;
    expect(Math.abs(after - before)).toBeLessThan(6);
  });
});

describe('swapCookedFlag — unité de saisie du remplaçant', () => {
  it('garde l’unité de l’original quand l’aliment sait se convertir', () => {
    expect(swapCookedFlag(food('steak-hache-5-cru'), true)).toBe(true);
    expect(swapCookedFlag(food('riz-complet-sec'), true)).toBe(true);
  });
  it('retombe sur l’état natif quand aucune conversion n’est connue', () => {
    expect(swapCookedFlag(food('thon-naturel'), false)).toBe(true);   // natif "cuit"
    expect(swapCookedFlag(food('oeuf-entier'), true)).toBe(false);    // natif "cru"
  });
});

describe('swapCandidates — alternatives proposées', () => {
  const allowed = new Set(['thon-naturel', 'oeuf-entier']);

  it('ne propose que des aliments du même rôle, jamais l’original', () => {
    const list = swapCandidates(food('poulet-blanc-cru'), 180, false, FOODS, allowed);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((c) => c.food.category === 'proteine')).toBe(true);
    expect(list.some((c) => c.food.id === 'poulet-blanc-cru')).toBe(false);
  });

  it('met les aliments déjà sélectionnés en tête', () => {
    const list = swapCandidates(food('poulet-blanc-cru'), 180, false, FOODS, allowed);
    const firstNotAllowed = list.findIndex((c) => !c.allowed);
    const lastAllowed = list.map((c) => c.allowed).lastIndexOf(true);
    expect(lastAllowed).toBeLessThan(firstNotAllowed);
  });

  it('classe les autorisés du profil macro le plus proche au plus lointain', () => {
    const list = swapCandidates(food('poulet-blanc-cru'), 180, false, FOODS, allowed);
    // Thon (26/0/1) est plus proche du poulet (23/0/1.5) que l'œuf (12.5/0.7/10).
    expect(list[0].food.id).toBe('thon-naturel');
  });

  it('les légumineuses ne sont pas proposées à la place d’un féculent (rôle distinct)', () => {
    const list = swapCandidates(food('riz-blanc-sec'), 90, false, FOODS, new Set());
    expect(list.some((c) => c.food.id === 'lentilles-seches')).toBe(false);
  });

  it('un aliment « autre » n’a pas d’alternative', () => {
    const autre: Food = {
      id: 'x', name: 'Divers', kcalPer100g: 100, proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1,
      category: 'autre', isCustom: true, state: 'raw', createdAt: 0
    };
    expect(swapCandidates(autre, 50, false, [...FOODS, autre], new Set())).toEqual([]);
  });
});

describe('applyFoodSwaps — remplacements durables', () => {
  const plan: Record<string, PlanTemplateMeal[]> = {
    '1': [{ slot: 'dejeuner', items: [
      { foodId: 'poulet-blanc-cru', grams: 126, cooked: true },
      { foodId: 'riz-blanc-sec',    grams: 225, cooked: true }
    ]}],
    '2': [{ slot: 'diner', items: [{ foodId: 'poulet-blanc-cru', grams: 126, cooked: true }] }]
  };

  it('remplace l’aliment partout dans la semaine', () => {
    const out = applyFoodSwaps(plan, { 'poulet-blanc-cru': 'thon-naturel' }, byId);
    expect(out['1'][0].items[0].foodId).toBe('thon-naturel');
    expect(out['2'][0].items[0].foodId).toBe('thon-naturel');
    expect(out['1'][0].items[1].foodId).toBe('riz-blanc-sec'); // intact
  });

  it('recalcule le grammage au lieu de le recopier', () => {
    const out = applyFoodSwaps(plan, { 'poulet-blanc-cru': 'oeuf-entier' }, byId);
    expect(out['1'][0].items[0].grams).not.toBe(126);
  });

  it('sans remplacement, le plan est rendu tel quel', () => {
    expect(applyFoodSwaps(plan, undefined, byId)).toBe(plan);
    expect(applyFoodSwaps(plan, {}, byId)).toBe(plan);
  });

  it('ignore une entrée dont l’aliment a été supprimé (pas de trou dans le menu)', () => {
    const out = applyFoodSwaps(plan, { 'poulet-blanc-cru': 'aliment-disparu' }, byId);
    expect(out['1'][0].items[0].foodId).toBe('poulet-blanc-cru');
  });
});

describe('swapInDayPlan — remplacement ponctuel', () => {
  const day: PlanTemplateMeal[] = [
    { slot: 'dejeuner', items: [{ foodId: 'poulet-blanc-cru', grams: 126, cooked: true }] },
    { slot: 'diner',    items: [{ foodId: 'poulet-blanc-cru', grams: 126, cooked: true }] }
  ];

  it('ne touche que le repas visé', () => {
    const out = swapInDayPlan(day, 'dejeuner', 'poulet-blanc-cru', food('thon-naturel'), byId);
    expect(out[0].items[0].foodId).toBe('thon-naturel');
    expect(out[1].items[0].foodId).toBe('poulet-blanc-cru');
  });

  it('laisse le plan intact si l’aliment n’est pas dans ce repas', () => {
    const out = swapInDayPlan(day, 'petit-dej', 'poulet-blanc-cru', food('thon-naturel'), byId);
    expect(out).toEqual(day);
  });

  it('fusionne quand le remplacement retombe sur un aliment déjà au menu (une seule ligne cochable)', () => {
    // Le repas contient déjà du thon ; on remplace le poulet par du thon → une seule ligne
    // (sinon les deux thons se cocheraient ensemble, cf. suivi des portions par foodId).
    const meal: PlanTemplateMeal[] = [
      { slot: 'dejeuner', items: [
        { foodId: 'poulet-blanc-cru', grams: 126, cooked: true },
        { foodId: 'thon-naturel', grams: 130, cooked: true }
      ] }
    ];
    const swapG = equivalentGrams(food('poulet-blanc-cru'), 126, true, food('thon-naturel'), true);
    const out = swapInDayPlan(meal, 'dejeuner', 'poulet-blanc-cru', food('thon-naturel'), byId);
    const thons = out[0].items.filter((it) => it.foodId === 'thon-naturel');
    expect(thons).toHaveLength(1);
    expect(thons[0].grams).toBe(Math.round((swapG + 130) * 10) / 10);
  });
});
