import { describe, it, expect } from 'vitest';
import {
  DIET_PRESETS, TAG_ORDER, matchingPreset, isExcluded, excludedReasons, usableFoodIds
} from '@/lib/diet';
import { missingEssentialRoles, substituteRotationToAllowed } from '@/lib/foodSelection';
import { swapCandidates } from '@/lib/swap';
import { weeklyCoverage } from '@/lib/coverage';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { SEED_FOODS } from '@/data/seedFoods';
import type { Food, FoodTag } from '@/types';

const FOODS: Food[] = SEED_FOODS.map((f) => ({ ...f, createdAt: 0 }));
const MAP = new Map(FOODS.map((f) => [f.id, f]));
const byId = (id: string) => MAP.get(id);
const food = (id: string) => MAP.get(id)!;
const preset = (id: string) => DIET_PRESETS.find((p) => p.id === id)!;

/** Plan construit comme le fait l'app, sous un jeu d'exclusions. */
function planWith(tags: FoodTag[]) {
  const allowed = usableFoodIds(undefined, tags, FOODS);
  const rotation = substituteRotationToAllowed(SEED_WEEKLY_ROTATION, allowed, byId);
  return scaleRotationToTargets(rotation, 2450, 187, 76, byId);
}

describe('isExcluded / excludedReasons', () => {
  it('un aliment porteur d’une étiquette exclue est écarté', () => {
    expect(isExcluded(food('poulet-blanc-cru'), ['viande'])).toBe(true);
    expect(isExcluded(food('riz-blanc-sec'), ['viande'])).toBe(false);
  });
  it('un aliment sans étiquette n’est jamais exclu', () => {
    expect(isExcluded(food('huile-olive'), [...TAG_ORDER])).toBe(false);
  });
  it('dit POURQUOI un aliment est écarté', () => {
    expect(excludedReasons(food('whey'), ['lacte', 'gluten'])).toEqual(['lacte']);
  });
  it('aucune exclusion → rien n’est écarté', () => {
    expect(isExcluded(food('poulet-blanc-cru'), [])).toBe(false);
    expect(isExcluded(food('poulet-blanc-cru'), undefined)).toBe(false);
  });
});

describe('matchingPreset', () => {
  it('reconnaît un profil posé tel quel', () => {
    expect(matchingPreset(['viande', 'poisson'])?.id).toBe('vegetarien');
    expect(matchingPreset([])?.id).toBe('omnivore');
  });
  it('des exclusions personnalisées ne correspondent à aucun profil', () => {
    expect(matchingPreset(['gluten', 'viande'])).toBeUndefined();
  });
});

describe('usableFoodIds — la sélection ne peut pas contourner une exclusion', () => {
  it('un aliment coché MAIS exclu n’est pas utilisable', () => {
    const usable = usableFoodIds(['poulet-blanc-cru', 'riz-blanc-sec'], ['viande'], FOODS);
    expect(usable.has('poulet-blanc-cru')).toBe(false);
    expect(usable.has('riz-blanc-sec')).toBe(true);
  });
  it('sans sélection explicite, tout est utilisable sauf les exclusions', () => {
    const usable = usableFoodIds(undefined, ['poisson'], FOODS);
    expect(usable.has('sardines-boite')).toBe(false);
    expect(usable.has('poulet-blanc-cru')).toBe(true);
  });
});

describe('les profils gardent une diète composable', () => {
  for (const p of DIET_PRESETS) {
    it(`profil « ${p.label} » : tous les rôles essentiels restent couverts`, () => {
      const usable = usableFoodIds(undefined, [...p.tags], FOODS);
      expect(missingEssentialRoles(usable, byId)).toEqual([]);
    });
  }
});

describe('aucun aliment exclu ne revient par une porte de derrière', () => {
  it('la substitution automatique n’en réintroduit pas', () => {
    const tags = [...preset('vegetarien').tags];
    const plan = planWith(tags);
    for (const meals of Object.values(plan)) {
      for (const m of meals) for (const it of m.items) {
        expect(isExcluded(byId(it.foodId), tags), it.foodId).toBe(false);
      }
    }
  });

  it('un profil végétalien ne laisse ni viande, ni poisson, ni œuf, ni laitier', () => {
    const tags = [...preset('vegetalien').tags];
    const plan = planWith(tags);
    const used = new Set(Object.values(plan).flatMap((ms) => ms.flatMap((m) => m.items.map((i) => i.foodId))));
    for (const id of used) expect(isExcluded(byId(id), tags), id).toBe(false);
  });

  it('les remplacements proposés n’en proposent pas', () => {
    const tags: FoodTag[] = ['poisson'];
    const choosable = FOODS.filter((f) => !isExcluded(f, tags));
    const allowed = usableFoodIds(undefined, tags, FOODS);
    const list = swapCandidates(food('poulet-blanc-cru'), 180, false, choosable, allowed);
    expect(list.some((c) => c.food.id === 'sardines-boite' || c.food.id === 'thon-naturel')).toBe(false);
    expect(list.length).toBeGreaterThan(0);
  });

  it('le bilan de couverture n’en suggère pas', () => {
    const tags: FoodTag[] = ['poisson'];
    const suggestable = FOODS.filter((f) => !isExcluded(f, tags));
    const allowed = usableFoodIds(undefined, tags, FOODS);
    const lines = weeklyCoverage(planWith(tags), byId, suggestable, allowed);
    for (const l of lines) {
      for (const s of l.suggestions) expect(isExcluded(s, tags), s.id).toBe(false);
    }
  });
});

describe('un aliment interdit sans substitut est RETIRÉ, jamais laissé dans l’assiette', () => {
  // Cas limite : on exclut le poisson ET on ne sélectionne aucune autre protéine.
  // L'ancien repli « rôle non couvert → on garde l'original » servait les sardines.
  const tags: FoodTag[] = ['poisson'];
  const allowed = new Set(['riz-blanc-sec']);

  const rotation = {
    '1': [{ slot: 'dejeuner' as const, items: [
      { foodId: 'sardines-boite', grams: 90, cooked: true },
      { foodId: 'riz-blanc-sec', grams: 225, cooked: true }
    ]}]
  };

  it('sans prédicat d’interdiction, l’original est conservé (repli historique)', () => {
    const out = substituteRotationToAllowed(rotation, allowed, byId);
    expect(out['1'][0].items.map((i) => i.foodId)).toContain('sardines-boite');
  });

  it('avec l’interdiction, l’item disparaît du repas', () => {
    const out = substituteRotationToAllowed(rotation, allowed, byId, (f) => isExcluded(f, tags));
    expect(out['1'][0].items.map((i) => i.foodId)).toEqual(['riz-blanc-sec']);
  });
});

describe('un profil peut créer un trou nutritionnel, et le bilan le dit', () => {
  it('végétalien → la B12 décroche et aucun aliment ne peut la combler', () => {
    const tags = [...preset('vegetalien').tags];
    const suggestable = FOODS.filter((f) => !isExcluded(f, tags));
    const allowed = usableFoodIds(undefined, tags, FOODS);
    const b12 = weeklyCoverage(planWith(tags), byId, suggestable, allowed).find((l) => l.nutrient === 'b12')!;
    expect(b12.ok).toBe(false);
    expect(b12.suggestions).toEqual([]);
  });

  it('végétarien → les oméga-3 décrochent (plus de poisson gras)', () => {
    const tags = [...preset('vegetarien').tags];
    const suggestable = FOODS.filter((f) => !isExcluded(f, tags));
    const allowed = usableFoodIds(undefined, tags, FOODS);
    const o3 = weeklyCoverage(planWith(tags), byId, suggestable, allowed).find((l) => l.nutrient === 'omega3')!;
    expect(o3.ok).toBe(false);
  });
});
