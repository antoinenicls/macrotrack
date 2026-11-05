import { describe, it, expect } from 'vitest';
import { mergeMealItems, getTemplateForDate } from '@/lib/templates';
import type { PlanTemplateMeal } from '@/types';
import type { FullSettings } from '@/services/repositories/settingsRepo';

describe('mergeMealItems — une ligne par aliment', () => {
  it('fusionne deux occurrences du même aliment et additionne les grammages', () => {
    const out = mergeMealItems([
      { foodId: 'huile-olive', grams: 16, cooked: false },
      { foodId: 'huile-olive', grams: 17, cooked: false }
    ]);
    expect(out).toEqual([{ foodId: 'huile-olive', grams: 33, cooked: false }]);
  });

  it('laisse intacts des aliments distincts et préserve l’ordre d’apparition', () => {
    const items = [
      { foodId: 'fromage-blanc', grams: 200, cooked: false },
      { foodId: 'whey', grams: 30, cooked: false },
      { foodId: 'banane', grams: 120, cooked: false }
    ];
    expect(mergeMealItems(items)).toEqual(items);
  });
});

describe('getTemplateForDate — dédoublonnage à la lecture', () => {
  it('un plan figé qui contient déjà un doublon rend une ligne cochable par aliment', () => {
    const frozen: PlanTemplateMeal[] = [
      { slot: 'collation', items: [
        { foodId: 'fromage-blanc', grams: 200, cooked: false },
        { foodId: 'whey', grams: 30, cooked: false },
        { foodId: 'huile-olive', grams: 16, cooked: false },
        { foodId: 'huile-olive', grams: 17, cooked: false },
        { foodId: 'banane', grams: 120, cooked: false }
      ] }
    ];
    const settings = { planSnapshots: { '2026-08-30': frozen }, planTemplate: [] } as unknown as FullSettings;
    const out = getTemplateForDate('2026-08-30', settings);
    const huiles = out[0].items.filter((it) => it.foodId === 'huile-olive');
    expect(huiles).toHaveLength(1);
    expect(huiles[0].grams).toBe(33);
    expect(out[0].items).toHaveLength(4);
  });
});
