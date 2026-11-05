import { describe, it, expect } from 'vitest';
import { estimateMaintenance, computeAdaptiveTarget, buildWeeklyReview, dietBreakStatus, miniCutStatus, refeedGuidance, recoveryStatus, referenceTdeeForDrop, MAINTENANCE_WINDOW_DAYS } from '@/lib/coach';
import { tdee, bmr, minSafeKcal, muscleSafeFloorKcal, recommendedGainRange } from '@/lib/nutrition';
import { ACTIVITY_FACTORS } from '@/types';
import { dayKey, subDays } from '@/lib/dates';
import {
  BASE_PROFILE, profileWith, foodById,
  weightSeries, mealSeries, mealKcal, mealEstimate
} from './fixtures';
import type { Meal, WeightEntry } from '@/types';

/* ───────────────── estimateMaintenance : bilan énergétique ───────────────── */

describe('estimateMaintenance — portes de fiabilité', () => {
  it('aucune donnée → no-data', () => {
    const r = estimateMaintenance([], foodById, [], 14);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-data');
  });

  it('pas assez de jours loggés → not-enough-logs', () => {
    const meals = mealSeries({ days: 14, kcal: 2450, skipAgeDays: [0,1,2,3,4,5,6,7,8] }); // 5 loggés
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-enough-logs');
  });

  it('assez de logs mais pesées insuffisantes (span < 7 j) → not-enough-weights', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 2, startKg: 85, kgPerWeek: 0.4 }); // 2 pesées, 1 j d’écart
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-enough-weights');
  });

  it('trou de logging ≥3 j consécutifs dans la période pesée → logging-gap', () => {
    const meals = mealSeries({ days: 14, kcal: 2450, skipAgeDays: [5,6,7] });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('logging-gap');
  });

  it('>40 % de jours estimés (non pesés) sur la période → too-estimated', () => {
    // 14 jours loggés, 8 en repas estimés (57 %) → apport trop bruité.
    const estimateAges = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
    const meals: Meal[] = [];
    for (let i = 13; i >= 0; i--) {
      meals.push(estimateAges.has(i) ? mealEstimate(i, 2450) : mealKcal(i, 2450));
    }
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too-estimated');
  });

  it('quelques jours estimés (<40 %) → la mesure reste valide', () => {
    // 14 jours loggés, 3 estimés (21 %) → sous le seuil, bilan toujours fiable.
    const estimateAges = new Set([2, 6, 10]);
    const meals: Meal[] = [];
    for (let i = 13; i >= 0; i--) {
      meals.push(estimateAges.has(i) ? mealEstimate(i, 2450) : mealKcal(i, 2450));
    }
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
  });

  it('un midi estimé CHAQUE jour (reste pesé) → mesure valide (seuil en kcal, pas en jours)', () => {
    // 14/14 jours ont un repas estimé, mais il ne pèse que 700/2450 ≈ 29 % de l'apport.
    const meals: Meal[] = [];
    for (let i = 13; i >= 0; i--) {
      meals.push(mealEstimate(i, 700, 'dejeuner'), mealKcal(i, 1750, 'diner'));
    }
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avgIntake).toBe(2450);
  });

  it('repas estimés majoritaires en kcal (>40 %) → too-estimated même si chaque jour a du pesé', () => {
    const meals: Meal[] = [];
    for (let i = 13; i >= 0; i--) {
      meals.push(mealEstimate(i, 1500, 'dejeuner'), mealKcal(i, 950, 'diner'));
    }
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('too-estimated');
  });
});

describe('estimateMaintenance — calcul', () => {
  it('poids stable + apport 2450 → maintenance = 2450 (exact)', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.avgIntake).toBe(2450);
      expect(r.tdee).toBe(2450);
      expect(r.weightDeltaKg).toBeCloseTo(0, 5);
    }
  });

  it('perte de poids → maintenance RÉELLE > apport (déficit réel détecté)', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.5 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tdee).toBeGreaterThan(r.avgIntake);
      expect(r.measuredBalance).toBeLessThan(0); // déficit
    }
  });

  it('prise de poids → maintenance RÉELLE < apport', () => {
    const meals = mealSeries({ days: 14, kcal: 3200 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: -0.5 }); // prend du poids
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tdee).toBeLessThan(r.avgIntake);
  });

  it('journée au logging incomplet (repas oublié) écartée → ne tire PAS la maintenance vers le bas', () => {
    // 13 j à 2450 + 1 j à 500 (dîner oublié) au milieu.
    const meals: Meal[] = [];
    for (let i = 13; i >= 0; i--) meals.push(mealKcal(i, i === 7 ? 500 : 2450));
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avgIntake).toBe(2450); // le jour à 500 est ignoré
  });

  it('journée « mangé à l’extérieur » (basse mais intentionnelle) → COMPTÉE', () => {
    const meals: Meal[] = [];
    for (let i = 13; i >= 0; i--) meals.push(i === 7 ? mealEstimate(7, 600) : mealKcal(i, 2450));
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = estimateMaintenance(meals, foodById, weights, 14);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avgIntake).toBeLessThan(2450); // le jour resto tire la moyenne
  });
});

/* ───────────────── computeAdaptiveTarget : cible appliquée ───────────────── */

const DEFICIT = 400;

describe('computeAdaptiveTarget — sources par ordre de fiabilité', () => {
  it('MESURÉE : maintenance mesurée − déficit', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, meals, foodById, weights);
    expect(r.source).toBe('measured');
    expect(r.maintenanceKcal).toBe(2450);
    expect(r.targetKcal).toBe(2450 - DEFICIT); // 2050
  });

  it('FORMULE : aucune donnée → TDEE − déficit + offset', () => {
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, []);
    expect(r.source).toBe('formula');
    expect(r.targetKcal).toBe(Math.round(tdee(BASE_PROFILE) - DEFICIT)); // ~2492
  });

  it('ANTI-STAGNATION : pesées OK mais peu de logs, perte trop lente → −150', () => {
    const weights = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.05 }); // bien trop lent
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, weights);
    expect(r.source).toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(-150);
    expect(r.trendAdjustKcal).toBe(-150);
    expect(r.targetKcal).toBe(Math.round(tdee(BASE_PROFILE) - DEFICIT) - 150);
  });

  it('RYTHME DANS LA CIBLE : pesées OK, peu de logs, perte conforme → in-range, offset inchangé', () => {
    const weights = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.36 });
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, weights);
    expect(r.source).toBe('in-range');
    expect(r.nudgeKcal).toBe(0);
  });
});

describe('computeAdaptiveTarget — garde-fous', () => {
  it('PLANCHER MUSCULAIRE : déficit énorme → cible plafonnée à 20 % de la maintenance, pas près du BMR', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(BASE_PROFILE, 1000, 0, meals, foodById, weights);
    // Maintenance mesurée 2450. Déficit demandé 1000 → 1450, sous le plancher.
    // %MG 15 = modéré → déficit plafonné à 20 % : plancher = 2450 × 0,8 = 1960 (> BMR 1928).
    expect(r.targetKcal).toBe(muscleSafeFloorKcal(BASE_PROFILE, 2450));
    expect(r.targetKcal).toBe(1960);
    expect(r.deficitCapped).toBe(true);
    expect(r.note).toMatch(/muscle|fondre|préservation|plafonne/i);
  });

  it('CLAMP OFFSET : l’offset cumulé ne dépasse pas −600', () => {
    const weights = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.05 });
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, -550, [], foodById, weights);
    expect(r.trendAdjustKcal).toBe(-600); // -550 -150 = -700, clampé à -600
  });

  it('MAINTIEN : déficit 0, poids stable → maintenance mesurée sans retrait', () => {
    const meals = mealSeries({ days: 14, kcal: 2700 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(profileWith({}), 0, 0, meals, foodById, weights);
    expect(r.source).toBe('measured');
    expect(r.targetKcal).toBe(2700);
  });

  it('PLANCHER BMR DÉSACTIVÉ : cible clampée au plancher ABSOLU (1500), pas au BMR', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    // 2450 - 1000 = 1450 < 1500 (plancher absolu) mais < 1928 (BMR). allowBelowBmr=true
    // (10e arg) → on plancherait à l'absolu, pas au BMR.
    const r = computeAdaptiveTarget(BASE_PROFILE, 1000, 0, meals, foodById, weights, undefined, true, 'cut', true);
    expect(r.targetKcal).toBe(minSafeKcal(BASE_PROFILE, { allowBelowBmr: true }));
    expect(r.targetKcal).toBe(1500);
    expect(r.note).toMatch(/Plancher absolu/);
  });

  it('PLANCHER BMR DÉSACTIVÉ : cible entre BMR et absolu passe (déficit modéré)', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    // 2450 - 600 = 1850 : sous le BMR (1928) mais au-dessus de l'absolu (1500).
    const r = computeAdaptiveTarget(BASE_PROFILE, 600, 0, meals, foodById, weights, undefined, true, 'cut', true);
    expect(r.targetKcal).toBe(1850); // non clampé — descend sous le BMR comme autorisé
  });
});

describe('computeAdaptiveTarget — garde anti-perte-trop-rapide (désactivable)', () => {
  // Perte très rapide (1,2 kg/sem > seuil 1 %/sem ≈ 0,85 kg) sans logs → branche repli.
  const FAST = weightSeries({ days: 21, startKg: 90, kgPerWeek: 1.2 });

  it('garde ACTIVE (défaut) : perte trop rapide → cible RELEVÉE de +150', () => {
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, FAST);
    expect(r.source).toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(+150);
    expect(r.targetKcal).toBe(Math.round(tdee(BASE_PROFILE) - DEFICIT) + 150);
  });

  it('garde DÉSACTIVÉE : perte trop rapide → cible NON remontée (sèche agressive)', () => {
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, FAST, undefined, false);
    expect(r.source).not.toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(0);
    expect(r.targetKcal).toBe(Math.round(tdee(BASE_PROFILE) - DEFICIT)); // formule pure, aucun +150
    expect(r.note).toMatch(/désactivée/i);
  });

  it('garde DÉSACTIVÉE ne touche PAS la correction "trop lent" (−150 conservé)', () => {
    const slow = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.05 });
    const r = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, slow, undefined, false);
    expect(r.source).toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(-150);
  });

  it('garde DÉSACTIVÉE : le plancher de sécurité BMR reste appliqué', () => {
    const r = computeAdaptiveTarget(BASE_PROFILE, 1200, 0, [], foodById, FAST, undefined, false);
    expect(r.targetKcal).toBeGreaterThanOrEqual(minSafeKcal(BASE_PROFILE));
  });
});

describe('computeAdaptiveTarget — facteur d’activité calibré', () => {
  it('le facteur calibré personnalise la formule de repli (jours sans logs)', () => {
    // Pas de données → branche formule. Facteur réel mesuré 1,30 < 1,5 générique.
    const generic = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, []);
    const calibrated = computeAdaptiveTarget(BASE_PROFILE, DEFICIT, 0, [], foodById, [], 1.30);
    expect(calibrated.source).toBe('formula');
    expect(calibrated.targetKcal).toBe(Math.round(bmr(BASE_PROFILE) * 1.30 - DEFICIT));
    expect(calibrated.targetKcal).toBeLessThan(generic.targetKcal); // colle à un métabolisme plus bas
  });
});

/* ───────────────── PRISE DE MASSE (bulk) — déficit signé négatif ───────────────── */

describe('recommendedGainRange — fourchette de prise selon le %MG', () => {
  it('%MG modéré (H 15) → 0,20–0,40 %/sem, pas de cut-first', () => {
    const r = recommendedGainRange(BASE_PROFILE);
    expect(r).toMatchObject({ min: 0.2, max: 0.4, level: 'moderate', cutFirst: false });
  });
  it('%MG bas (H 8) → 0,25–0,50 %/sem, pas de cut-first', () => {
    const r = recommendedGainRange(profileWith({ bodyFatPct: 8 }));
    expect(r).toMatchObject({ min: 0.25, max: 0.5, level: 'low', cutFirst: false });
  });
  it('%MG élevé (H 25) → 0,10–0,25 %/sem + cut-first', () => {
    const r = recommendedGainRange(profileWith({ bodyFatPct: 25 }));
    expect(r).toMatchObject({ min: 0.1, max: 0.25, level: 'high', cutFirst: true });
  });
});

describe('computeAdaptiveTarget — PRISE DE MASSE (bulk)', () => {
  const SURPLUS = -300; // deficitKcal signé : négatif = surplus de 300
  const BULK_FORMULA = Math.round(tdee(BASE_PROFILE) - SURPLUS); // = tdee + 300

  it('MESURÉE : maintenance mesurée + surplus (note « surplus », pas de plancher)', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(BASE_PROFILE, SURPLUS, 0, meals, foodById, weights, undefined, true, 'bulk');
    expect(r.source).toBe('measured');
    expect(r.maintenanceKcal).toBe(2450);
    expect(r.targetKcal).toBe(2450 - SURPLUS); // 2750
    expect(r.note).toMatch(/surplus/i);
    expect(r.note).not.toMatch(/plancher/i);
  });

  it('PRISE TROP LENTE : poids stable → surplus relevé de +150', () => {
    const weights = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0 }); // ne prend pas
    const r = computeAdaptiveTarget(BASE_PROFILE, SURPLUS, 0, [], foodById, weights, undefined, true, 'bulk');
    expect(r.source).toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(+150);
    expect(r.trendAdjustKcal).toBe(+150);
    expect(r.targetKcal).toBe(BULK_FORMULA + 150);
    expect(r.note).toMatch(/lente/i);
  });

  it('PRISE TROP RAPIDE : prise > plafond → surplus réduit de −150 (message gras)', () => {
    const fast = weightSeries({ days: 21, startKg: 80, kgPerWeek: -0.9 }); // prend 0,9 kg/sem
    const r = computeAdaptiveTarget(BASE_PROFILE, SURPLUS, 0, [], foodById, fast, undefined, true, 'bulk');
    expect(r.source).toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(-150);
    expect(r.targetKcal).toBe(BULK_FORMULA - 150);
    expect(r.note).toMatch(/gras|rapide/i);
  });

  it('GARDE lean-bulk DÉSACTIVÉE : prise trop rapide → surplus NON abaissé (dirty bulk)', () => {
    const fast = weightSeries({ days: 21, startKg: 80, kgPerWeek: -0.9 });
    const r = computeAdaptiveTarget(BASE_PROFILE, SURPLUS, 0, [], foodById, fast, undefined, false, 'bulk');
    expect(r.source).not.toBe('trend-nudge');
    expect(r.nudgeKcal).toBe(0);
    expect(r.targetKcal).toBe(BULK_FORMULA); // aucun −150
    expect(r.note).toMatch(/désactiv/i);
  });
});

/* ───────────────── miniCutStatus : symétrique du diet break ───────────────── */

describe('miniCutStatus — recommandation de mini-cut', () => {
  const WEEK = 7 * 86_400_000;
  const now = Date.now();

  it('pas de date de début (hors prise) → jamais recommandé', () => {
    const r = miniCutStatus({ bulkStartedAt: undefined, now });
    expect(r.onBulk).toBe(false);
    expect(r.recommended).toBe(false);
    expect(r.message).toBeNull();
  });

  it('prise récente (<10 sem), %MG ok → pas encore de mini-cut', () => {
    const r = miniCutStatus({ bulkStartedAt: now - 4 * WEEK, now, sex: 'M', bodyFatPct: 15 });
    expect(r.onBulk).toBe(true);
    expect(r.recommended).toBe(false);
    expect(Math.round(r.weeksOnBulk!)).toBe(4);
  });

  it('≥10 sem continues → mini-cut recommandé (non urgent)', () => {
    const r = miniCutStatus({ bulkStartedAt: now - 11 * WEEK, now, sex: 'M', bodyFatPct: 15 });
    expect(r.recommended).toBe(true);
    expect(r.urgent).toBe(false);
  });

  it('≥16 sem continues → fortement conseillé (urgent)', () => {
    const r = miniCutStatus({ bulkStartedAt: now - 17 * WEEK, now, sex: 'M', bodyFatPct: 15 });
    expect(r.recommended).toBe(true);
    expect(r.urgent).toBe(true);
  });

  it('%MG élevé (H>20) → mini-cut recommandé même si prise courte', () => {
    const r = miniCutStatus({ bulkStartedAt: now - 2 * WEEK, now, sex: 'M', bodyFatPct: 24 });
    expect(r.bodyFatHigh).toBe(true);
    expect(r.recommended).toBe(true);
    expect(r.message).toMatch(/%mg|gras/i);
  });
});

describe('buildWeeklyReview — bilan hebdo', () => {
  it('compte les jours loggés sur 7, le rythme et la maintenance mesurée', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = buildWeeklyReview(meals, foodById, weights, { targetKcal: 2050, deficitKcal: 400 });
    expect(r.loggedDays).toBe(7);
    expect(r.weeklyRateKg!).toBeCloseTo(-0.4, 1);
    expect(r.measuredTdee).not.toBeNull();
    expect(r.targetKcal).toBe(2050);
    expect(r.goalJustReached).toBe(false);
  });

  it('assiduité faible → note invitant à logger', () => {
    const meals = mealSeries({ days: 14, kcal: 2450, skipAgeDays: [0, 1, 2, 3, 4] }); // 2 jours sur 7 récents
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = buildWeeklyReview(meals, foodById, weights, { targetKcal: 2050, deficitKcal: 400 });
    expect(r.loggedDays).toBeLessThan(4);
    expect(r.adherenceNote).toMatch(/logue/i);
  });

  it('objectif tout juste atteint → headline maintien', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = buildWeeklyReview(meals, foodById, weights, {
      targetKcal: 2450, deficitKcal: 0, goalWeightKg: 80, goalReachedAt: Date.now()
    });
    expect(r.goalJustReached).toBe(true);
    expect(r.headline).toMatch(/maintien/i);
  });

  it('objectif en cours → reste & ETA exposés', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.4 });
    const r = buildWeeklyReview(meals, foodById, weights, {
      targetKcal: 2050, deficitKcal: 400, goalWeightKg: 80
    });
    expect(r.goalRemainingKg!).toBeGreaterThan(0);
    expect(r.goalOnTrack).toBe(true);
  });
});

/* ───────────────── dietBreakStatus : pause diète ───────────────── */

describe('dietBreakStatus — recommandation de pause', () => {
  const WEEK = 7 * 86_400_000;
  const now = Date.now();

  it('pas de date de début (hors sèche) → jamais recommandé', () => {
    const r = dietBreakStatus({ cutStartedAt: undefined, now });
    expect(r.onCut).toBe(false);
    expect(r.recommended).toBe(false);
    expect(r.message).toBeNull();
  });

  it('sèche récente (<8 sem) → pas encore de pause', () => {
    const r = dietBreakStatus({ cutStartedAt: now - 4 * WEEK, now });
    expect(r.onCut).toBe(true);
    expect(r.recommended).toBe(false);
    expect(Math.round(r.weeksOnCut!)).toBe(4);
  });

  it('≥8 sem continues → pause recommandée (non urgente)', () => {
    const r = dietBreakStatus({ cutStartedAt: now - 9 * WEEK, now });
    expect(r.recommended).toBe(true);
    expect(r.urgent).toBe(false);
    expect(r.message).toMatch(/maintenance/i);
  });

  it('≥12 sem continues → pause fortement conseillée (urgente + avis pro)', () => {
    const r = dietBreakStatus({ cutStartedAt: now - 13 * WEEK, now });
    expect(r.recommended).toBe(true);
    expect(r.urgent).toBe(true);
    expect(r.message).toMatch(/diét|médical/i);
  });

  it('adaptation métabolique marquée (maintenance mesurée ≥12 % sous la formule) → pause même si sèche courte', () => {
    const r = dietBreakStatus({ cutStartedAt: now - 3 * WEEK, now, measuredTdee: 2200, formulaTdee: 2850 });
    expect(r.metabolicDropPct).toBeGreaterThanOrEqual(12);
    expect(r.recommended).toBe(true);
  });

  it('maintenance mesurée proche de la formule → pas de déclencheur adaptation', () => {
    const r = dietBreakStatus({ cutStartedAt: now - 3 * WEEK, now, measuredTdee: 2800, formulaTdee: 2850 });
    expect(r.recommended).toBe(false);
  });
});

describe('buildWeeklyReview — diet break exposé', () => {
  const WEEK = 7 * 86_400_000;
  it('sèche longue → dietBreak.recommended dans le bilan', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    const r = buildWeeklyReview(meals, foodById, weights, {
      targetKcal: 2050, deficitKcal: 400, cutStartedAt: Date.now() - 10 * WEEK
    });
    expect(r.dietBreak.recommended).toBe(true);
  });

  it('en maintien (déficit 0) → pas de pause suggérée même avec une vieille date', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = buildWeeklyReview(meals, foodById, weights, {
      targetKcal: 2450, deficitKcal: 0, cutStartedAt: Date.now() - 20 * WEEK
    });
    expect(r.dietBreak.recommended).toBe(false);
  });
});

describe('buildWeeklyReview — PRISE DE MASSE', () => {
  const WEEK = 7 * 86_400_000;

  it('prise dans la cible → headline orienté « prise »', () => {
    const meals = mealSeries({ days: 14, kcal: 3100 });
    const weights = weightSeries({ days: 21, startKg: 80, kgPerWeek: -0.3 }); // prend ~0,3 kg/sem
    const r = buildWeeklyReview(meals, foodById, weights, {
      targetKcal: 3100, deficitKcal: -300, mode: 'bulk'
    });
    expect(r.weeklyRateKg!).toBeGreaterThan(0); // prise
    expect(r.headline).toMatch(/prise/i);
    expect(r.dietBreak.recommended).toBe(false); // jamais de pause diète en bulk
  });

  it('prise longue → miniCut.recommended dans le bilan', () => {
    const meals = mealSeries({ days: 14, kcal: 3100 });
    const weights = weightSeries({ days: 14, startKg: 80, kgPerWeek: -0.3 });
    const r = buildWeeklyReview(meals, foodById, weights, {
      targetKcal: 3100, deficitKcal: -300, mode: 'bulk',
      bulkStartedAt: Date.now() - 12 * WEEK, sex: 'M', bodyFatPct: 15
    });
    expect(r.miniCut.recommended).toBe(true);
  });
});

describe('refeedGuidance — jour de recharge', () => {
  it('hors sèche (déficit 0) → non applicable', () => {
    const r = refeedGuidance(BASE_PROFILE, 2850, 187, 0);
    expect(r.applicable).toBe(false);
    expect(r.recommended).toBe(false);
    expect(r.macros).toBeNull();
  });

  it('sèche + %MG modéré → recommandé, ~1/sem à /2 sem', () => {
    const r = refeedGuidance(BASE_PROFILE, 2850, 187, 400);
    expect(r.applicable).toBe(true);
    expect(r.level).toBe('moderate');
    expect(r.recommended).toBe(true);
    expect(r.frequencyLabel).toMatch(/semaine/i);
  });

  it('macros du refeed : protéines constantes, lipides bas (~0,5 g/kg), kcal = maintenance, glucides = reste', () => {
    const r = refeedGuidance(BASE_PROFILE, 2850, 187, 400);
    expect(r.macros!.kcal).toBe(2850);
    expect(r.macros!.protein).toBe(187);            // inchangées
    expect(r.macros!.fat).toBe(Math.round(0.5 * 84.85)); // 42 g
    // glucides = (2850 - 187*4 - 42*9)/4 = (2850-748-378)/4 = 431
    expect(r.macros!.carbs).toBe(Math.round((2850 - 187 * 4 - 42 * 9) / 4));
    expect(r.carbsPerKg!).toBeGreaterThan(4);       // recharge dans la zone 4-6 g/kg
  });

  it('%MG élevé (>20) → superflu (non recommandé) même en sèche', () => {
    const r = refeedGuidance(profileWith({ bodyFatPct: 26 }), 3000, 187, 400);
    expect(r.applicable).toBe(true);
    expect(r.level).toBe('high');
    expect(r.recommended).toBe(false);
  });

  it('%MG bas (<12) → 1 à 2 refeeds/semaine', () => {
    const r = refeedGuidance(profileWith({ bodyFatPct: 9 }), 2700, 200, 400);
    expect(r.level).toBe('low');
    expect(r.recommended).toBe(true);
    expect(r.frequencyLabel).toMatch(/1 à 2/i);
  });
});

describe('computeAdaptiveTarget — suggestion augmenter la dépense sous plancher', () => {
  it('quand le plancher mord, la note suggère d’augmenter la dépense, pas de couper plus', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(BASE_PROFILE, 1000, 0, meals, foodById, weights);
    expect(r.note).toMatch(/dépense|cardio|pas/i);
  });

  it('un déficit RAISONNABLE n’est pas plafonné (pas de fausse alerte)', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    // Maintenance ≈ 2450 ; déficit 400 → 2050, bien au-dessus du plancher 1960.
    const r = computeAdaptiveTarget(BASE_PROFILE, 400, 0, meals, foodById, weights);
    expect(r.deficitCapped).toBe(false);
    expect(r.targetKcal).toBeGreaterThan(muscleSafeFloorKcal(BASE_PROFILE, 2450));
  });

  it('plus on est sec, plus le plancher musculaire est haut (déficit resserré)', () => {
    const lean = profileWith({ bodyFatPct: 10 });   // %MG bas → cap 15 %
    const soft = profileWith({ bodyFatPct: 25 });    // %MG élevé → cap 25 %
    expect(muscleSafeFloorKcal(lean, 2800)).toBeGreaterThan(muscleSafeFloorKcal(soft, 2800));
  });
});

describe('estimateMaintenance — robustesse régression (cheat meal)', () => {
  it('un pic d’eau transitoire (cheat meal) ne fait pas s’effondrer la maintenance mesurée', () => {
    const meals = mealSeries({ days: 14, kcal: 2450 });
    const clean = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4 });
    // +1,2 kg de rétention sur une pesée au MILIEU de la fenêtre (transitoire) : la
    // régression, qui pondère par l’écart à la moyenne, l’absorbe presque entièrement.
    const mid = Math.floor(clean.length / 2);
    const spiked = clean.map((e, i) => (i === mid ? { ...e, kg: e.kg + 1.2 } : e));
    const a = estimateMaintenance(meals, foodById, clean, 14);
    const b = estimateMaintenance(meals, foodById, spiked, 14);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(Math.abs(b.tdee - a.tdee)).toBeLessThan(60);
  });
});

describe('recoveryStatus — rappel de fin de récupération (pendant de la pause diète)', () => {
  const DAY = 86_400_000;
  it('hors récup si aucune date posée', () => {
    const r = recoveryStatus({ recoveryStartedAt: undefined });
    expect(r.onRecovery).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.message).toBeNull();
  });

  it('en récup mais < 2 sem : en cours, pas encore prêt à reprendre', () => {
    const r = recoveryStatus({ recoveryStartedAt: Date.now() - 8 * DAY });
    expect(r.onRecovery).toBe(true);
    expect(r.ready).toBe(false);
    expect(r.overdue).toBe(false);
    expect(r.message).toMatch(/en cours|2-3/i);
  });

  it('≥ 2 sem : récup faite, prêt à reprendre', () => {
    const r = recoveryStatus({ recoveryStartedAt: Date.now() - 15 * DAY });
    expect(r.ready).toBe(true);
    expect(r.overdue).toBe(false);
    expect(r.message).toMatch(/reprendre|prêt/i);
  });

  it('≥ 4 sem : en retard, reprise vivement conseillée', () => {
    const r = recoveryStatus({ recoveryStartedAt: Date.now() - 30 * DAY });
    expect(r.ready).toBe(true);
    expect(r.overdue).toBe(true);
    expect(r.message).toMatch(/stagn|repars|reprends/i);
  });
});

describe('computeAdaptiveTarget — plausibilité de la maintenance mesurée', () => {
  it('mesurée sous BMR×1,2 (sous-loggage probable) → REJETÉE, repli sur la maintenance théorique', () => {
    // Logs à 1800 + poids stable → mesurée ressort à 1800, sous BMR×1,2 (~2313, aberrant).
    const meals = mealSeries({ days: 14, kcal: 1800 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(BASE_PROFILE, 0, 0, meals, foodById, weights, undefined, true, 'maintain');
    // On ne la traite plus comme "mesurée" : on cale sur la maintenance théorique (activité
    // DÉCLARÉE, moderate = 1,5), PAS le sédentaire 1,2, sinon la cible se colle au BMR.
    expect(r.source).toBe('formula');
    expect(r.maintenanceKcal).toBeNull();
    expect(r.measuredImplausible).toBe(true);
    expect(r.targetKcal).toBe(Math.round(bmr(BASE_PROFILE) * 1.5)); // maintien, déficit 0
    expect(r.targetKcal).toBeGreaterThan(Math.round(bmr(BASE_PROFILE) * 1.2)); // au-dessus du sédentaire
    expect(r.note).toMatch(/anormalement basse|estim|logue/i);
  });

  it('sèche + mesurée aberrante → cible calée sur la théorique − déficit, PAS collée au BMR', () => {
    // Le cas vécu : sous-loggage massif (900 kcal) alors qu'on ne perd pas. Sèche 0,5 %/sem.
    const meals = mealSeries({ days: 18, kcal: 900 });
    const weights = weightSeries({ days: 18, startKg: 85, kgPerWeek: 0 });
    const deficit = Math.round((0.5 / 100) * 85 * 7700 / 7); // ~468
    const r = computeAdaptiveTarget(BASE_PROFILE, deficit, 0, meals, foodById, weights, undefined, true, 'cut');
    expect(r.measuredImplausible).toBe(true);
    const bmrK = Math.round(bmr(BASE_PROFILE));
    // La cible est nettement au-dessus du BMR (théorique 1,5 − déficit), pas ~BMR.
    expect(r.targetKcal).toBeGreaterThan(bmrK + 250);
    expect(r.targetKcal).toBeCloseTo(Math.round(bmr(BASE_PROFILE) * 1.5) - deficit, -1);
  });

  it('un measuredActivityFactor déjà pollué (1,2) ne rabaisse PAS le repli sous le niveau déclaré', () => {
    const meals = mealSeries({ days: 18, kcal: 900 });
    const weights = weightSeries({ days: 18, startKg: 85, kgPerWeek: 0 });
    // Facteur mesuré pollué à 1,2 passé en paramètre : le repli doit quand même viser 1,5.
    const r = computeAdaptiveTarget(BASE_PROFILE, 0, 0, meals, foodById, weights, 1.2, true, 'maintain');
    expect(r.targetKcal).toBe(Math.round(bmr(BASE_PROFILE) * 1.5));
  });

  it('mesurée plausible (au-dessus du plancher) → utilisée telle quelle', () => {
    const meals = mealSeries({ days: 14, kcal: 2700 });
    const weights = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0 });
    const r = computeAdaptiveTarget(BASE_PROFILE, 0, 0, meals, foodById, weights, undefined, true, 'maintain');
    expect(r.source).toBe('measured');
    expect(r.maintenanceKcal).toBe(2700);
    expect(r.measuredImplausible).toBeFalsy();
    expect(r.note).not.toMatch(/anormalement basse/i);
  });
});

/* ───── estimateMaintenance : fenêtre 21 j + pondération par récence (R1) ───── */

describe('estimateMaintenance — bilan pondéré sur 21 jours', () => {
  it('fenêtre par défaut = 21 jours', () => {
    expect(MAINTENANCE_WINDOW_DAYS).toBe(21);
  });

  it('perte linéaire + apport constant → identité énergétique préservée (TDEE = apport + rythme×7700)', () => {
    // 0,5 kg/sem de perte, 2500 kcal/j → TDEE = 2500 + (0,5/7)×7700 = 2500 + 550 = 3050.
    const meals = mealSeries({ days: 21, kcal: 2500 });
    const weights = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.5 });
    const r = estimateMaintenance(meals, foodById, weights);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tdee).toBeGreaterThanOrEqual(3010);
      expect(r.tdee).toBeLessThanOrEqual(3090);
    }
  });

  /** 21 pesées, kg défini par âge (0 = aujourd'hui, 20 = le plus ancien). */
  const weightsByAge = (kgByAge: (age: number) => number): WeightEntry[] =>
    Array.from({ length: 21 }, (_, idx) => {
      const age = 20 - idx;
      return { id: `w${age}`, date: dayKey(subDays(new Date(), age)), kg: kgByAge(age) };
    });

  it('récence : une perte concentrée RÉCEMMENT donne un déficit mesuré plus fort qu’une perte ancienne', () => {
    const meals = mealSeries({ days: 21, kcal: 2500 });
    // Même perte totale (0,5 kg) et même apport, mais placée à des moments différents.
    const recentLoss = estimateMaintenance(
      meals, foodById,
      weightsByAge((age) => (age <= 10 ? 85 - 0.05 * (10 - age) : 85)) // plat puis chute récente
    );
    const earlyLoss = estimateMaintenance(
      meals, foodById,
      weightsByAge((age) => (age >= 10 ? 85 - 0.05 * (age - 10) : 85)) // chute ancienne puis plat
    );
    expect(recentLoss.ok && earlyLoss.ok).toBe(true);
    if (recentLoss.ok && earlyLoss.ok) {
      // Pondérée par récence : la perte récente pèse plus → maintenance mesurée plus haute
      // (déficit réel jugé plus fort) que si la même perte datait de 3 semaines.
      expect(recentLoss.tdee).toBeGreaterThan(earlyLoss.tdee + 150);
      // Perte ancienne + plat récent → tendance récente ≈ 0 → maintenance ≈ apport.
      expect(earlyLoss.tdee).toBeLessThan(2700);
      expect(recentLoss.tdee).toBeGreaterThan(2650);
    }
  });
});

/* ───────── referenceTdeeForDrop : référence du détecteur d'adaptation (R4) ───────── */

describe('referenceTdeeForDrop', () => {
  it('sans facteur gelé → repli sur le facteur théorique du niveau d’activité', () => {
    const ref = referenceTdeeForDrop(BASE_PROFILE);
    expect(ref).toBe(Math.round(bmr(BASE_PROFILE) * ACTIVITY_FACTORS[BASE_PROFILE.activity]));
    expect(ref).toBe(Math.round(tdee(BASE_PROFILE)));
  });

  it('avec facteur gelé → BMR courant × facteur de référence (pas le facteur générique)', () => {
    const frozen = 1.35; // NEAT réel plus bas que le 1,5 générique
    const ref = referenceTdeeForDrop(BASE_PROFILE, frozen);
    expect(ref).toBe(Math.round(bmr(BASE_PROFILE) * frozen));
    // Nettement sous la formule générique → ne fabrique pas de fausse « chute ».
    expect(ref).toBeLessThan(Math.round(tdee(BASE_PROFILE)));
  });

  it('empêche le faux positif de pause diète quand le NEAT réel est sous 1,5', () => {
    // Utilisateur sédentaire malgré le niveau déclaré : vraie maintenance ≈ BMR×1,28,
    // soit ~15 % sous le 1,5 générique. Maintenance mesurée cohérente avec ce NEAT réel.
    const realFactor = 1.28;
    const measured = Math.round(bmr(BASE_PROFILE) * realFactor);
    const cutStartedAt = Date.now() - 3 * 7 * 86_400_000; // 3 sem : sous le seuil de durée

    // Référence générique (BUG R4) : la formule 1,5 surestime → fausse chute déclenchée.
    const buggy = dietBreakStatus({
      cutStartedAt,
      measuredTdee: measured,
      formulaTdee: Math.round(tdee(BASE_PROFILE))
    });
    expect(buggy.metabolicDropPct!).toBeGreaterThanOrEqual(12);
    expect(buggy.recommended).toBe(true); // faux positif

    // Référence calibrée (facteur gelé sur le NEAT réel) : plus d’écart artificiel, pas de reco.
    const fixed = dietBreakStatus({
      cutStartedAt,
      measuredTdee: measured,
      formulaTdee: referenceTdeeForDrop(BASE_PROFILE, realFactor)
    });
    expect(Math.abs(fixed.metabolicDropPct!)).toBeLessThan(12);
    expect(fixed.recommended).toBe(false);
  });

  it('détecte une VRAIE adaptation : maintenance mesurée bien sous le facteur gelé', () => {
    const frozen = 1.55;
    const reference = referenceTdeeForDrop(BASE_PROFILE, frozen);
    const measured = Math.round(reference * 0.83); // −17 % : adaptation marquée
    const status = dietBreakStatus({
      cutStartedAt: Date.now() - 3 * 7 * 86_400_000,
      measuredTdee: measured,
      formulaTdee: reference
    });
    expect(status.metabolicDropPct!).toBeGreaterThanOrEqual(12);
    expect(status.recommended).toBe(true);
  });
});
