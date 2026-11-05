import { describe, it, expect } from 'vitest';
import {
  bmr, tdee, minSafeKcal, muscleSafeFloorKcal, maxDeficitFraction, computeMacros, computeMacrosFromGrams, proteinTargetG,
  fatTargetG, recommendedRateRange, toNativeGrams, macrosForItem, effectiveTargets
} from '@/lib/nutrition';
import { BASE_PROFILE, profileWith, RICE_RAW, CHICKEN_COOKED, KCAL_FOOD } from './fixtures';

describe('BMR', () => {
  it('Katch-McArdle quand %MG connu', () => {
    // leanMass = 84.85 * 0.85 = 72.1225 ; 370 + 21.6*72.1225 = 1927.85
    expect(bmr(BASE_PROFILE)).toBeCloseTo(1927.85, 1);
  });

  it('Mifflin-St Jeor quand %MG absent (homme)', () => {
    const p = profileWith({ bodyFatPct: undefined });
    // 10*84.85 + 6.25*180 - 5*21 + 5 = 1873.5
    expect(bmr(p)).toBeCloseTo(1873.5, 1);
  });

  it('Mifflin femme retranche 161', () => {
    const f = profileWith({ sex: 'F', bodyFatPct: undefined });
    expect(bmr(f)).toBeCloseTo(1873.5 - 5 - 161, 1); // -5 (annule +5) -161
  });

  it('ignore un %MG aberrant (>=60 ou <=0) → bascule Mifflin', () => {
    expect(bmr(profileWith({ bodyFatPct: 75 }))).toBeCloseTo(1873.5, 1);
    expect(bmr(profileWith({ bodyFatPct: 0 }))).toBeCloseTo(1873.5, 1);
  });
});

describe('TDEE par activité', () => {
  it('applique le bon facteur', () => {
    expect(tdee(profileWith({ activity: 'sedentary' }))).toBeCloseTo(1927.85 * 1.2, 0);
    expect(tdee(profileWith({ activity: 'moderate' }))).toBeCloseTo(1927.85 * 1.5, 0);
    expect(tdee(profileWith({ activity: 'very-active' }))).toBeCloseTo(1927.85 * 1.9, 0);
  });
});

describe('Plancher de sécurité', () => {
  it('= BMR pour un homme costaud (au-dessus du plancher absolu 1500)', () => {
    expect(minSafeKcal(BASE_PROFILE)).toBe(1928);
  });
  it('= plancher absolu si BMR descend en dessous', () => {
    // petite femme : BMR < 1200 → clampé à 1200
    const tiny = profileWith({ sex: 'F', weightKg: 40, heightCm: 150, ageYears: 70, bodyFatPct: undefined });
    expect(minSafeKcal(tiny)).toBe(1200);
  });
  it('allowBelowBmr : retire le plancher BMR, garde le plancher absolu (1500 H)', () => {
    // BMR 1928 > 1500 : sans l'option on plancherait à 1928, avec on tombe à 1500.
    expect(minSafeKcal(BASE_PROFILE, { allowBelowBmr: true })).toBe(1500);
  });
  it('allowBelowBmr ne descend jamais sous le plancher absolu', () => {
    const tiny = profileWith({ sex: 'F', weightKg: 40, heightCm: 150, ageYears: 70, bodyFatPct: undefined });
    expect(minSafeKcal(tiny, { allowBelowBmr: true })).toBe(1200);
  });
});

describe('computeMacros', () => {
  it('protéines & lipides sur poids, glucides = reste', () => {
    const m = computeMacros(2450, 84.85, 2.2, 0.9);
    expect(m.protein).toBe(187); // 2.2*84.85
    expect(m.fat).toBe(76);      // 0.9*84.85
    expect(m.kcal).toBe(2450);
    // glucides = (2450 - 187*4 - 76*9)/4 = 1018/4 = 254.5 -> 255
    expect(m.carbs).toBe(255);
  });

  it('ne produit jamais de glucides négatifs', () => {
    const m = computeMacros(800, 84.85, 2.2, 0.9); // P+L dépassent déjà 800 kcal
    expect(m.carbs).toBe(0);
  });
});

describe('Conversion cru/cuit', () => {
  it('riz : 250 g cuit → 100 g sec (÷2.5) → macros sur le sec', () => {
    expect(toNativeGrams(RICE_RAW, 250, true)).toBeCloseTo(100, 5);
    const m = macrosForItem(RICE_RAW, { foodId: 'riz', grams: 250, cooked: true });
    expect(m.kcal).toBeCloseTo(350, 1); // 100g sec
  });

  it('poulet (macros cuites) : 150 g cru → 105 g cuit (×0.7)', () => {
    expect(toNativeGrams(CHICKEN_COOKED, 150, false)).toBeCloseTo(105, 5);
    const m = macrosForItem(CHICKEN_COOKED, { foodId: 'poulet', grams: 150, cooked: false });
    expect(m.kcal).toBeCloseTo(173.25, 1);
  });

  it('même état saisi/natif → pas de conversion', () => {
    expect(toNativeGrams(RICE_RAW, 90, false)).toBe(90);
    expect(toNativeGrams(CHICKEN_COOKED, 120, true)).toBe(120);
  });
});

describe('macrosForItem', () => {
  it('repas extérieur (estimate) → renvoie le snapshot tel quel', () => {
    const m = macrosForItem(undefined, {
      foodId: 'X', grams: 0, cooked: false,
      estimate: { category: 'main-fastfood', kcal: 900, protein: 35, carbs: 80, fat: 45 }
    });
    expect(m).toEqual({ kcal: 900, protein: 35, carbs: 80, fat: 45 });
  });

  it('aliment introuvable → zéro (pas de NaN)', () => {
    expect(macrosForItem(undefined, { foodId: 'nope', grams: 100, cooked: false }))
      .toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('1 kcal/g food : grams = kcal', () => {
    expect(macrosForItem(KCAL_FOOD, { foodId: 'kcal', grams: 2300, cooked: false }).kcal).toBe(2300);
  });
});

describe('effectiveTargets', () => {
  it('respecte les cibles manuelles si présentes', () => {
    const p = profileWith({ targetKcal: 2450, targetProteinG: 187, targetFatG: 75, targetCarbsG: 255 });
    expect(effectiveTargets(p)).toEqual({ kcal: 2450, protein: 187, fat: 75, carbs: 255 });
  });

  it('sinon calcule depuis TDEE − déficit, protéines sur masse maigre', () => {
    const p = profileWith({ targetProteinG: undefined, targetFatG: undefined, targetCarbsG: undefined });
    const t = effectiveTargets(p, 400);
    expect(t.kcal).toBe(Math.round(tdee(p) - 400)); // ~2492
    expect(t.protein).toBe(proteinTargetG(p, 400));  // basé masse maigre, pas 2.2 g/kg poids
    expect(t.protein).toBeGreaterThan(proteinTargetG(p, 0)); // relevé en sèche
  });
});

describe('proteinTargetG (protéines sur masse maigre, qui montent en sèche selon la sécheresse)', () => {
  it('au maintien (déficit 0) : 2,4 g/kg de masse maigre', () => {
    // leanMass = 84.85*0.85 = 72.12 ; 2.4*72.12 = 173 ; plancher 1.8*84.85 = 152.7
    expect(proteinTargetG(BASE_PROFILE, 0)).toBe(173);
  });

  it('monte avec le déficit (préservation musculaire)', () => {
    const p0 = proteinTargetG(BASE_PROFILE, 0);
    const p400 = proteinTargetG(BASE_PROFILE, 400);
    const p500 = proteinTargetG(BASE_PROFILE, 500);
    expect(p400).toBeGreaterThan(p0);
    expect(p500).toBeGreaterThanOrEqual(p400);
    // 15 % MG → sécheresse 3/8 → 2.4 + 0.6*0.375 = 2.625 g/kg MM × 72.12 = 189
    expect(p500).toBe(189);
  });

  it('plafonne même au-delà de −500', () => {
    expect(proteinTargetG(BASE_PROFILE, 900)).toBe(proteinTargetG(BASE_PROFILE, 500));
  });

  it('en sèche : 2,4 g/kg MM à ≥18 % MG, 3,0 g/kg MM à ≤10 % MG', () => {
    const at = (bf: number) => proteinTargetG(profileWith({ bodyFatPct: bf }), 500);
    const lbm = (bf: number) => 84.85 * (1 - bf / 100);
    expect(at(20)).toBe(Math.round(2.4 * lbm(20))); // 163 : encore gras → glucides gardés
    expect(at(10)).toBe(Math.round(3.0 * lbm(10))); // 229 : très sec → haut de fourchette
    expect(at(8)).toBe(Math.round(3.0 * lbm(8)));
    expect(at(14)).toBeGreaterThan(at(17));
  });

  it('ne descend jamais sous 1,8 g/kg de poids quand le %MG est connu', () => {
    const p = profileWith({ bodyFatPct: 40 }); // masse maigre faible : 2.4*50.9 = 122 < 1.8*84.85
    expect(proteinTargetG(p, 500)).toBe(Math.round(1.8 * 84.85));
  });

  it('sans %MG : repli sur le ratio g/kg de poids (jamais sous le comportement actuel)', () => {
    const p = profileWith({ bodyFatPct: undefined });
    expect(proteinTargetG(p, 400)).toBe(Math.round(2.2 * 84.85)); // 187
  });
});

describe('fatTargetG (plancher lipidique hormonal)', () => {
  it('respecte le réglage du profil quand il est au-dessus du plancher', () => {
    // 0.9 * 84.85 = 76.4 ; planchers : 0.5*84.85=42.4 ; 20% de 2450 /9 = 54.4 → 76 gagne
    expect(fatTargetG(BASE_PROFILE, 2450)).toBe(76);
  });

  it('applique le plancher 20 % des kcal quand le réglage descend en dessous', () => {
    // fatPerKg très bas (0.3) → réglage 25.5 g ; plancher 20% de 2450 = 54.4 g → floor gagne
    const p = profileWith({ fatPerKg: 0.3 });
    expect(fatTargetG(p, 2450)).toBe(54);
  });

  it('applique le plancher 0,5 g/kg quand il est le plus contraignant (cible très basse)', () => {
    // cible 600 kcal : 20% = 13.3 g ; 0.5*84.85 = 42.4 g → 0,5 g/kg gagne
    const p = profileWith({ fatPerKg: 0.3 });
    expect(fatTargetG(p, 600)).toBe(42);
  });

  it('ne change PAS les macros du profil par défaut (le plancher ne mord pas)', () => {
    const t = effectiveTargets(profileWith({ targetProteinG: undefined, targetFatG: undefined, targetCarbsG: undefined }), 400);
    // fat = fatTargetG au kcal calculé ; à 0.9 g/kg le plancher ne mord pas
    expect(t.fat).toBe(fatTargetG(BASE_PROFILE, t.kcal));
    expect(t.fat).toBeGreaterThanOrEqual(Math.round(0.9 * 84.85) - 1);
  });
});

describe('recommendedRateRange (rythme indexé sur le %MG)', () => {
  it('homme %MG modéré (15 %) → 0,5–0,7 %/sem', () => {
    expect(recommendedRateRange(BASE_PROFILE)).toEqual({ min: 0.5, max: 0.7, level: 'moderate' });
  });
  it('homme sec (<12 %) → 0,25–0,5 %/sem', () => {
    expect(recommendedRateRange(profileWith({ bodyFatPct: 9 }))).toEqual({ min: 0.25, max: 0.5, level: 'low' });
  });
  it('homme gras (>20 %) → 0,7–1,0 %/sem', () => {
    expect(recommendedRateRange(profileWith({ bodyFatPct: 26 }))).toEqual({ min: 0.7, max: 1.0, level: 'high' });
  });
  it('femme : seuils décalés (28/22)', () => {
    expect(recommendedRateRange(profileWith({ sex: 'F', bodyFatPct: 25 })).level).toBe('moderate');
    expect(recommendedRateRange(profileWith({ sex: 'F', bodyFatPct: 30 })).level).toBe('high');
    expect(recommendedRateRange(profileWith({ sex: 'F', bodyFatPct: 20 })).level).toBe('low');
  });
  it('sans %MG fiable → fourchette modérée par défaut', () => {
    expect(recommendedRateRange(profileWith({ bodyFatPct: undefined })).level).toBe('moderate');
  });
});

describe('computeMacrosFromGrams', () => {
  it('prend protéines & lipides en grammes, glucides = reste', () => {
    const m = computeMacrosFromGrams(2050, 208, 76);
    expect(m.protein).toBe(208);
    expect(m.fat).toBe(76);
    expect(m.carbs).toBe(Math.round((2050 - 208 * 4 - 76 * 9) / 4));
  });
});

describe('maxDeficitFraction — plus on est sec, plus on resserre', () => {
  it('%MG élevé → 25 %, modéré → 20 %, bas → 15 %', () => {
    expect(maxDeficitFraction(profileWith({ bodyFatPct: 25 }))).toBe(0.25);
    expect(maxDeficitFraction(profileWith({ bodyFatPct: 16 }))).toBe(0.2);
    expect(maxDeficitFraction(profileWith({ bodyFatPct: 10 }))).toBe(0.15);
  });
  it('%MG inconnu → 20 % (modéré par défaut)', () => {
    expect(maxDeficitFraction(profileWith({ bodyFatPct: undefined }))).toBe(0.2);
  });
});

describe('muscleSafeFloorKcal — garde-fou anti-fonte musculaire', () => {
  it('plafonne le déficit à la fraction du maintien (jamais près du BMR)', () => {
    // %MG 15 = modéré → 20 % ; maintenance 2700 → plancher 2160.
    expect(muscleSafeFloorKcal(BASE_PROFILE, 2700)).toBe(2160);
  });

  it('reste toujours ≥ plancher BMR même si la fraction donnerait moins', () => {
    // Maintenance basse : 20 % donnerait 1600 < BMR (~1928) → on garde le BMR.
    expect(muscleSafeFloorKcal(BASE_PROFILE, 2000)).toBe(minSafeKcal(BASE_PROFILE));
  });

  it('un profil sec a un plancher plus haut (déficit plus prudent) à maintien égal', () => {
    const lean = profileWith({ bodyFatPct: 10 });
    const soft = profileWith({ bodyFatPct: 25 });
    expect(muscleSafeFloorKcal(lean, 2800)).toBeGreaterThan(muscleSafeFloorKcal(soft, 2800));
  });

  it('sèche agressive assumée (allowBelowBmr) : seul le plancher absolu subsiste', () => {
    expect(muscleSafeFloorKcal(BASE_PROFILE, 2700, { allowBelowBmr: true }))
      .toBe(minSafeKcal(BASE_PROFILE, { allowBelowBmr: true }));
  });
});
