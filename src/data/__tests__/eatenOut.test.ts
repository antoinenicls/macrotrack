import { describe, it, expect } from 'vitest';
import { estimateFromPortions, estimateFor, describeEstimate, presetFor, presetsForSlot, otherPresetGroups, EXTRAS, ZERO_PORTIONS } from '@/data/eatenOut';

describe('portions à la main', () => {
  it('compose les macros depuis le décompte (4/4/9 kcal)', () => {
    // 2 paumes + 2 poignées féculent + 1 pouce + 1 poignée légumes.
    const est = estimateFromPortions({ protein: 2, carbs: 2, fat: 1, veg: 1 });
    expect(est.method).toBe('hand');
    expect(est.protein).toBe(58); // 25·2 + 3·2 + 2·1
    expect(est.carbs).toBe(55);   // 25·2 + 5·1
    expect(est.fat).toBe(25);     // 6·2 + 1·2 + 11·1
    expect(est.kcal).toBe(58 * 4 + 55 * 4 + 25 * 9);
  });

  it('assiette vide → tout à zéro', () => {
    const est = estimateFromPortions(ZERO_PORTIONS);
    expect(est).toMatchObject({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('mémorise le décompte pour ré-édition', () => {
    const est = estimateFromPortions({ protein: 1.5, carbs: 1, fat: 0, veg: 2 });
    expect(est.portions).toEqual({ protein: 1.5, carbs: 1, fat: 0, veg: 2 });
  });

  it('les demi-portions sont prises en compte', () => {
    const full = estimateFromPortions({ protein: 2, carbs: 0, fat: 0, veg: 0 });
    const half = estimateFromPortions({ protein: 1, carbs: 0, fat: 0, veg: 0 });
    expect(full.protein).toBe(2 * half.protein);
  });
});

describe('describeEstimate', () => {
  it('méthode main → libellé + détail des portions', () => {
    const est = estimateFromPortions({ protein: 2, carbs: 1.5, fat: 1, veg: 0 });
    const d = describeEstimate(est);
    expect(d.label).toBe('Assiette estimée');
    expect(d.detail).toContain('🖐×2');
    expect(d.detail).toContain('✊×1.5');
    expect(d.detail).not.toContain('🥦'); // veg = 0 masqué
  });

  it('méthode catégorie → libellé du preset', () => {
    const est = estimateFor('main-fastfood');
    const d = describeEstimate(est);
    expect(d.label).toBeTruthy();
    expect(d.detail).toBeNull();
  });

  it('ancien snapshot sans method → toujours décrit (rétro-compat)', () => {
    const legacy = { category: 'main-equilibre', kcal: 700, protein: 45, carbs: 70, fat: 25 } as const;
    expect(describeEstimate(legacy).label).toBeTruthy();
  });
});

describe('plats précis, taille et suppléments', () => {
  it('chaque plat a des kcal cohérentes avec ses macros (alcool exclu)', () => {
    for (const slot of ['petit-dej', 'dejeuner', 'collation'] as const) {
      for (const p of presetsForSlot(slot)) {
        const fromMacros = p.protein * 4 + p.carbs * 4 + p.fat * 9;
        expect(Math.abs(fromMacros - p.kcal) / p.kcal).toBeLessThan(0.1);
      }
    }
  });

  it('la taille multiplie le plat, les suppléments s\'ajoutent', () => {
    const pizza = presetFor('main-pizza');
    const soda = EXTRAS.find((e) => e.key === 'soda')!.per;
    const est = estimateFor('main-pizza', 1.3, { soda: 1, dessert: 0 });
    expect(est.kcal).toBe(Math.round(pizza.kcal * 1.3 + soda.kcal));
    expect(est.carbs).toBe(Math.round(pizza.carbs * 1.3 + soda.carbs));
    expect(est).toMatchObject({ method: 'category', category: 'main-pizza', size: 1.3, extras: { soda: 1 } });
  });

  it('portion normale sans supplément : snapshot identique à l\'ancien forfait', () => {
    expect(estimateFor('main-equilibre')).toEqual({ method: 'category', category: 'main-equilibre', kcal: 700, protein: 45, carbs: 70, fat: 25 });
  });

  it('suppléments aussi en méthode à la main (l\'alcool compte en kcal)', () => {
    const base = estimateFromPortions({ protein: 1, carbs: 1, fat: 0, veg: 0 });
    const withBeer = estimateFromPortions({ protein: 1, carbs: 1, fat: 0, veg: 0 }, { biere: 2 });
    expect(withBeer.kcal - base.kcal).toBe(2 * EXTRAS.find((e) => e.key === 'biere')!.per.kcal);
    expect(withBeer.extras).toEqual({ biere: 2 });
  });

  it('détail lisible : taille + suppléments', () => {
    const d = describeEstimate(estimateFor('main-kebab', 1.3, { frites: 1, soda: 1 }));
    expect(d.label).toBe('Kebab');
    expect(d.detail).toContain('Portion grande');
    expect(d.detail).toContain('🍟×1');
  });

  it('autres moments : plats précis seulement, jamais le groupe du créneau', () => {
    const groups = otherPresetGroups('dejeuner');
    expect(groups.map((g) => g.label)).not.toContain('Plats');
    for (const g of groups) expect(g.presets.every((p) => !p.generic)).toBe(true);
  });
});
