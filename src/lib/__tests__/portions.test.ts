import { describe, it, expect } from 'vitest';
import { quantizeGrams, portionLabel, isDiscrete, templatePortionState } from '@/lib/portions';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import { macrosForItem } from '@/lib/nutrition';
import type { Food } from '@/types';

const FOODS: Food[] = SEED_FOODS.map((f) => ({ ...f, createdAt: 0 }));
const MAP = new Map(FOODS.map((f) => [f.id, f]));
const byId = (id: string) => MAP.get(id);
const food = (id: string) => MAP.get(id)!;

describe('isDiscrete — ce qui se mange par pièces', () => {
  it('banane, œuf, boîte de thon → par pièces', () => {
    expect(isDiscrete(food('banane'))).toBe(true);
    expect(isDiscrete(food('oeuf-entier'))).toBe(true);
    expect(isDiscrete(food('thon-naturel'))).toBe(true);
  });
  it('riz, poulet, fromage blanc → au poids', () => {
    expect(isDiscrete(food('riz-blanc-sec'))).toBe(false);
    expect(isDiscrete(food('poulet-blanc-cru'))).toBe(false);
    expect(isDiscrete(food('fromage-blanc-0'))).toBe(false);
  });
});

describe('quantizeGrams — arrondi au morceau réaliste', () => {
  it('une quantité minuscule devient au moins un morceau, jamais un tiers de banane', () => {
    // Le cas signalé : 10 g de banane n'existe pas.
    expect(quantizeGrams(food('banane'), 10, false)).toBe(55); // ½ banane
  });

  it('200 g de banane deviennent 2 bananes entières', () => {
    const g = quantizeGrams(food('banane'), 200, false);
    expect(g).toBe(220);
    expect(portionLabel(food('banane'), g, false)).toBe('2 bananes moyennes');
  });

  it('arrondit au morceau le plus proche, vers le bas comme vers le haut', () => {
    expect(quantizeGrams(food('oeuf-entier'), 115, false)).toBe(100); // 2 œufs
    expect(quantizeGrams(food('oeuf-entier'), 140, false)).toBe(150); // 3 œufs
  });

  it('une boîte de conserve ne se coupe pas en trois', () => {
    expect(quantizeGrams(food('thon-naturel'), 159, true)).toBe(130); // 1 boîte
    expect(quantizeGrams(food('sardines-boite'), 120, true)).toBe(90); // 1 boîte
  });

  it('un aliment qui se pèse librement n’est pas arrondi', () => {
    expect(quantizeGrams(food('riz-blanc-sec'), 93, false)).toBe(93);
    expect(quantizeGrams(food('poulet-blanc-cru'), 187, false)).toBe(187);
  });

  it('respecte l’unité de saisie CUIT (le pas porte sur l’état natif)', () => {
    // Pas de 130 g de thon (natif cuit) : saisi en cuit, le pas reste 130.
    expect(quantizeGrams(food('thon-naturel'), 200, true)).toBe(260);
  });

  it('aliment absent → quantité inchangée (pas de plantage)', () => {
    expect(quantizeGrams(undefined, 77, false)).toBe(77);
  });
});

describe('portionLabel — dire ce qu’on sort du frigo', () => {
  it('traduit les grammes en pièces', () => {
    expect(portionLabel(food('oeuf-entier'), 150, false)).toBe('3 œufs moyens');
    expect(portionLabel(food('kiwi'), 40, false)).toBe('½ kiwi');
    expect(portionLabel(food('chocolat-noir-80'), 10, false)).toBe('2 carrés');
  });
  it('rien à dire pour un aliment qui se pèse', () => {
    expect(portionLabel(food('riz-blanc-sec'), 90, false)).toBeNull();
  });
});

describe('le plan hebdomadaire ne contient que des pièces entières', () => {
  const cases = [
    { label: 'cible de référence', kcal: 2450, p: 187, f: 76 },
    { label: 'sèche forte', kcal: 2050, p: 187, f: 76 },
    { label: 'surplus', kcal: 3000, p: 200, f: 85 }
  ];

  for (const c of cases) {
    it(`${c.label} : chaque aliment "à la pièce" tombe sur un multiple de son pas`, () => {
      const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, c.kcal, c.p, c.f, byId);
      for (const [day, meals] of Object.entries(scaled)) {
        for (const m of meals) for (const it of m.items) {
          const f = byId(it.foodId)!;
          if (!isDiscrete(f)) continue;
          expect(quantizeGrams(f, it.grams, it.cooked), `jour ${day} · ${f.name} ${it.grams}g`).toBe(it.grams);
        }
      }
    });
  }

  it('et la journée reste malgré tout sur sa cible', () => {
    const scaled = scaleRotationToTargets(SEED_WEEKLY_ROTATION, 2450, 187, 76, byId);
    for (const [day, meals] of Object.entries(scaled)) {
      let kcal = 0, protein = 0;
      for (const m of meals) for (const it of m.items) {
        const mm = macrosForItem(byId(it.foodId), it);
        kcal += mm.kcal; protein += mm.protein;
      }
      expect(Math.abs(kcal - 2450), `jour ${day} kcal`).toBeLessThan(40);
      expect(Math.abs(protein - 187), `jour ${day} P`).toBeLessThan(5);
    }
  });
});

describe('templatePortionState — entamé / validé / dépassé', () => {
  it('rien mangé → off (ni full, ni partial, ni over)', () => {
    const s = templatePortionState(0, 159);
    expect(s.full).toBe(false);
    expect(s.partial).toBe(false);
    expect(s.over).toBe(false);
    expect(s.remaining).toBe(159);
    expect(s.excess).toBe(0);
  });

  it('mangé moins que prévu → partial, avec le reste', () => {
    const s = templatePortionState(80, 159);
    expect(s.partial).toBe(true);
    expect(s.full).toBe(false);
    expect(s.over).toBe(false);
    expect(s.remaining).toBe(79);
    expect(s.excess).toBe(0);
  });

  it('mangé pile le prévu (à 0,5 g près) → full, sans dépassement', () => {
    const s = templatePortionState(159, 159);
    expect(s.full).toBe(true);
    expect(s.over).toBe(false);
    expect(s.partial).toBe(false);
    expect(s.remaining).toBe(0);
    expect(s.excess).toBe(0);
  });

  it('mangé PLUS que prévu → over ET full, avec le dépassement (cas 180 vs 159)', () => {
    const s = templatePortionState(180, 159);
    expect(s.over).toBe(true);
    expect(s.full).toBe(true);       // la portion prévue est bien atteinte
    expect(s.partial).toBe(false);
    expect(s.remaining).toBe(0);
    expect(s.excess).toBe(21);
    expect(s.consumed).toBe(180);
  });

  it('tolérance 0,5 g : ni un poil sous ni un poil au-dessus ne bascule', () => {
    expect(templatePortionState(158.6, 159).full).toBe(true);   // ~pile
    expect(templatePortionState(158.6, 159).partial).toBe(false);
    expect(templatePortionState(159.4, 159).over).toBe(false);  // ~pile, pas dépassé
  });

  it('grammes négatifs bornés à 0', () => {
    expect(templatePortionState(-5, 100).consumed).toBe(0);
  });
});
