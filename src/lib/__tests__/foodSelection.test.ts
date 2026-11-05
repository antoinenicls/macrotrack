import { describe, it, expect } from 'vitest';
import {
  foodRole, BASE_FOOD_IDS, ESSENTIAL_ROLES,
  missingEssentialRoles, coveredRoles, effectiveAllowedIds, substituteRotationToAllowed
} from '@/lib/foodSelection';
import { SEED_FOODS } from '@/data/seedFoods';
import type { Food, PlanTemplateMeal } from '@/types';

const byId = (id: string): Food | undefined => {
  const f = SEED_FOODS.find((x) => x.id === id);
  return f ? { ...f, createdAt: 0 } : undefined;
};
const allIds = SEED_FOODS.map((f) => f.id);

describe('foodRole — rôle déduit de la catégorie (+ overrides)', () => {
  it('protéine / féculent / fruit / lipide / légume', () => {
    expect(foodRole(byId('poulet-blanc-cru')!)).toBe('protein');
    expect(foodRole(byId('riz-complet-sec')!)).toBe('carb');
    expect(foodRole(byId('banane')!)).toBe('fruit');
    expect(foodRole(byId('huile-olive')!)).toBe('fat');
    expect(foodRole(byId('haricots-verts')!)).toBe('veg');
  });
  it('les lentilles sont une LÉGUMINEUSE (override), pas un simple féculent', () => {
    expect(foodRole(byId('lentilles-seches')!)).toBe('legume');
  });
  it('catégorie « autre » → rôle other', () => {
    expect(foodRole({ id: 'x', category: 'autre' })).toBe('other');
  });
});

describe('couverture de rôle (base « obligatoire » par rôle)', () => {
  it('la base recommandée couvre tous les rôles essentiels', () => {
    expect(missingEssentialRoles(BASE_FOOD_IDS, byId)).toEqual([]);
  });

  it('retirer LA protéine de la base laisse un rôle essentiel non couvert', () => {
    const withoutProtein = BASE_FOOD_IDS.filter((id) => id !== 'oeuf-entier');
    expect(missingEssentialRoles(withoutProtein, byId)).toContain('protein');
  });

  it('remplacer les œufs par du poulet garde le rôle protéine couvert (cas allergie)', () => {
    const swapped = BASE_FOOD_IDS.filter((id) => id !== 'oeuf-entier').concat('poulet-blanc-cru');
    expect(missingEssentialRoles(swapped, byId)).toEqual([]);
  });

  it('coveredRoles inclut la légumineuse pour la base', () => {
    expect(coveredRoles(BASE_FOOD_IDS, byId).has('legume')).toBe(true);
  });
});

describe('effectiveAllowedIds', () => {
  it('sélection absente → TOUS les aliments (comportement historique)', () => {
    expect(effectiveAllowedIds(undefined, allIds).size).toBe(allIds.length);
  });
  it('sélection définie → uniquement ces aliments', () => {
    expect([...effectiveAllowedIds(['banane', 'pomme'], allIds)].sort()).toEqual(['banane', 'pomme']);
  });
});

describe('substituteRotationToAllowed — remplacement par rôle', () => {
  const rotation: Record<string, PlanTemplateMeal[]> = {
    '1': [
      { slot: 'dejeuner', items: [
        { foodId: 'poulet-blanc-cru', grams: 150, cooked: true }, // protéine NON autorisée
        { foodId: 'riz-complet-sec',  grams: 200, cooked: true }, // autorisé
        { foodId: 'brocoli',          grams: 150, cooked: true }  // légume NON autorisé
      ]}
    ]
  };

  it('un aliment autorisé est conservé tel quel', () => {
    const allowed = effectiveAllowedIds(['riz-complet-sec', 'oeuf-entier', 'haricots-verts', 'banane', 'huile-olive'], allIds);
    const out = substituteRotationToAllowed(rotation, allowed, byId);
    expect(out['1'][0].items[1].foodId).toBe('riz-complet-sec');
  });

  it('un aliment non autorisé est remplacé par un autorisé du même rôle', () => {
    const allowed = effectiveAllowedIds(['riz-complet-sec', 'oeuf-entier', 'haricots-verts', 'banane', 'huile-olive'], allIds);
    const out = substituteRotationToAllowed(rotation, allowed, byId);
    // poulet (protéine) → seule protéine autorisée = œuf ; brocoli (légume) → haricots verts
    expect(out['1'][0].items[0].foodId).toBe('oeuf-entier');
    expect(out['1'][0].items[2].foodId).toBe('haricots-verts');
    // grammage & état cru/cuit conservés (le solveur rescale ensuite)
    expect(out['1'][0].items[0].grams).toBe(150);
    expect(out['1'][0].items[0].cooked).toBe(true);
  });

  it('choisit le substitut au profil macro le plus proche', () => {
    // Protéines autorisées : thon (maigre, proche du poulet) vs beurre de cacahuète interdit.
    const allowed = effectiveAllowedIds(['thon-naturel', 'oeuf-entier', 'riz-complet-sec', 'haricots-verts', 'banane', 'huile-olive'], allIds);
    const out = substituteRotationToAllowed(rotation, allowed, byId);
    // poulet (23P/0C/1.5F) plus proche du thon (26/0/1) que de l'œuf (12.5/0.7/10)
    expect(out['1'][0].items[0].foodId).toBe('thon-naturel');
  });

  it('rôle non couvert (aucune protéine autorisée) → aliment conservé (repli sûr)', () => {
    const allowed = effectiveAllowedIds(['riz-complet-sec', 'haricots-verts', 'banane', 'huile-olive'], allIds);
    const out = substituteRotationToAllowed(rotation, allowed, byId);
    expect(out['1'][0].items[0].foodId).toBe('poulet-blanc-cru'); // inchangé
  });

  it('ESSENTIAL_ROLES = protéine, féculent, légume, fruit, lipide', () => {
    expect([...ESSENTIAL_ROLES].sort()).toEqual(['carb', 'fat', 'fruit', 'protein', 'veg']);
  });
});

describe('substituteRotationToAllowed — variété des substituts', () => {
  /** Un steak (non autorisé) par jour sur `n` jours. */
  const steakDays = (n: number): Record<string, PlanTemplateMeal[]> =>
    Object.fromEntries(
      Array.from({ length: n }, (_, i) => [
        String(i + 1),
        [{ slot: 'dejeuner' as const, items: [{ foodId: 'steak-hache-5-cru', grams: 150, cooked: false }] }]
      ])
    );

  const proteinsOf = (out: Record<string, PlanTemplateMeal[]>) =>
    Object.keys(out).sort().map((d) => out[d][0].items[0].foodId);

  it('alterne entre substituts comparables au lieu de servir toujours le même', () => {
    // Poulet et thon sont tous deux des protéines maigres proches du steak.
    const allowed = effectiveAllowedIds(
      ['poulet-blanc-cru', 'thon-naturel', 'riz-complet-sec', 'haricots-verts', 'banane', 'huile-olive'],
      allIds
    );
    const picks = proteinsOf(substituteRotationToAllowed(steakDays(4), allowed, byId));
    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(new Set(picks)).toEqual(new Set(['poulet-blanc-cru', 'thon-naturel']));
  });

  it('ne pioche jamais un substitut au profil macro aberrant, même pour varier', () => {
    // La whey est bien une protéine, mais 80 g P / 100 g : hors bande de tolérance.
    const allowed = effectiveAllowedIds(
      ['thon-naturel', 'whey', 'riz-complet-sec', 'haricots-verts', 'banane', 'huile-olive'],
      allIds
    );
    const picks = proteinsOf(substituteRotationToAllowed(steakDays(5), allowed, byId));
    expect(picks.every((id) => id === 'thon-naturel')).toBe(true);
  });

  it('ne s’empile pas sur un aliment déjà servi ce jour-là', () => {
    // Le poulet est DÉJÀ au menu du jour : le steak part donc sur le thon.
    const rotation: Record<string, PlanTemplateMeal[]> = {
      '1': [{ slot: 'dejeuner', items: [
        { foodId: 'poulet-blanc-cru',   grams: 150, cooked: false },
        { foodId: 'steak-hache-5-cru',  grams: 150, cooked: false }
      ]}]
    };
    const allowed = effectiveAllowedIds(
      ['poulet-blanc-cru', 'thon-naturel', 'riz-complet-sec', 'haricots-verts', 'banane', 'huile-olive'],
      allIds
    );
    const out = substituteRotationToAllowed(rotation, allowed, byId);
    expect(out['1'][0].items[0].foodId).toBe('poulet-blanc-cru'); // autorisé, inchangé
    expect(out['1'][0].items[1].foodId).toBe('thon-naturel');
  });

  it('reste déterministe (même entrée, même sortie)', () => {
    const allowed = effectiveAllowedIds(
      ['poulet-blanc-cru', 'thon-naturel', 'riz-complet-sec', 'haricots-verts', 'banane', 'huile-olive'],
      allIds
    );
    const a = proteinsOf(substituteRotationToAllowed(steakDays(6), allowed, byId));
    const b = proteinsOf(substituteRotationToAllowed(steakDays(6), allowed, byId));
    expect(a).toEqual(b);
  });
});
