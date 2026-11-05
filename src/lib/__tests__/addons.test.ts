import { describe, it, expect } from 'vitest';
import { injectAddonFoods } from '../addons';
import type { AddonFood, PlanTemplateMeal } from '@/types';

const baseRotation = (): Record<string, PlanTemplateMeal[]> => ({
  '1': [
    { slot: 'petit-dej', items: [{ foodId: 'oeuf-entier', grams: 150, cooked: false }] },
    { slot: 'collation', items: [{ foodId: 'fromage-blanc-0', grams: 250, cooked: false }] }
  ],
  '2': [
    { slot: 'dejeuner', items: [{ foodId: 'poulet-blanc-cru', grams: 126, cooked: true }] }
  ]
});

const creme = (over: Partial<AddonFood> = {}): AddonFood => ({
  id: 'creme-de-riz',
  foodId: 'creme-de-riz-chocolat',
  variants: [
    { foodId: 'creme-de-riz-chocolat', label: 'Chocolat' },
    { foodId: 'creme-de-riz-vanille', label: 'Vanille' }
  ],
  slot: 'collation', grams: 40, cooked: false, available: true, ...over
});

describe('injectAddonFoods', () => {
  it('injecte un appoint disponible dans son créneau, sur tous les jours', () => {
    const out = injectAddonFoods(baseRotation(), [creme()]);
    const day1Collation = out['1'].find((m) => m.slot === 'collation')!;
    expect(day1Collation.items).toEqual([
      { foodId: 'fromage-blanc-0', grams: 250, cooked: false },
      { foodId: 'creme-de-riz-chocolat', grams: 40, cooked: false }
    ]);
    // Jour sans le créneau : il est créé.
    const day2Collation = out['2'].find((m) => m.slot === 'collation');
    expect(day2Collation?.items).toEqual([{ foodId: 'creme-de-riz-chocolat', grams: 40, cooked: false }]);
  });

  it('injecte la VARIANTE active, pas les autres parfums', () => {
    const out = injectAddonFoods(baseRotation(), [creme({ foodId: 'creme-de-riz-vanille' })]);
    const injected = out['1'].find((m) => m.slot === 'collation')!.items.map((i) => i.foodId);
    expect(injected).toContain('creme-de-riz-vanille');
    expect(injected).not.toContain('creme-de-riz-chocolat');
  });

  it('n’injecte rien quand l’appoint est indisponible', () => {
    const out = injectAddonFoods(baseRotation(), [creme({ available: false })]);
    expect(out).toEqual(baseRotation());
  });

  it('ignore un appoint à 0 g ou bloqué (exclusion)', () => {
    const zero = injectAddonFoods(baseRotation(), [creme({ grams: 0 })]);
    expect(zero).toEqual(baseRotation());
    const blocked = injectAddonFoods(baseRotation(), [creme()], (id) => id === 'creme-de-riz-chocolat');
    expect(blocked).toEqual(baseRotation());
  });

  it('sans appoint (undefined ou vide) renvoie la rotation intacte', () => {
    expect(injectAddonFoods(baseRotation(), undefined)).toEqual(baseRotation());
    expect(injectAddonFoods(baseRotation(), [])).toEqual(baseRotation());
  });

  it('un créneau créé respecte l’ordre canonique des repas', () => {
    // Appoint au petit-déj sur un jour qui n'a que le déjeuner → petit-dej doit passer avant.
    const out = injectAddonFoods(baseRotation(), [creme({ slot: 'petit-dej' })]);
    expect(out['2'].map((m) => m.slot)).toEqual(['petit-dej', 'dejeuner']);
  });

  it('ne mute pas la rotation d’entrée', () => {
    const input = baseRotation();
    const snapshot = JSON.stringify(input);
    injectAddonFoods(input, [creme()]);
    expect(JSON.stringify(input)).toEqual(snapshot);
  });
});
