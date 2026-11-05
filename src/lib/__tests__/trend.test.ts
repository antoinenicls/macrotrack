import { describe, it, expect } from 'vitest';
import { buildTrend, buildValueTrend, trendStats, adjustmentHint, projectGoal, olsSlopePerDay, weightedOlsSlopePerDay, smoothedBodyFatPct, RATE_TOLERANCE } from '@/lib/trend';
import { weightSeries } from './fixtures';
import type { WeightEntry } from '@/types';
import { dayKey, subDays } from '@/lib/dates';

describe('olsSlopePerDay (régression linéaire)', () => {
  it('série parfaitement linéaire → pente exacte (kg/jour)', () => {
    const w = weightSeries({ days: 21, startKg: 86, kgPerWeek: 0.7 });
    expect(olsSlopePerDay(w)!).toBeCloseTo(-0.7 / 7, 4);
  });

  it('robuste à un pic d’eau isolé (cheat meal) vs différence de bords', () => {
    const clean = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.4 });
    const slopeClean = olsSlopePerDay(clean)!;
    // +1.2 kg de rétention sur la pesée la plus récente
    const spiked = clean.map((e, i) => (i === clean.length - 1 ? { ...e, kg: e.kg + 1.2 } : e));
    const slopeSpiked = olsSlopePerDay(spiked)!;
    // La pente bouge peu (le pic est noyé dans 21 points) — pas d’inversion brutale.
    expect(Math.abs(slopeSpiked - slopeClean)).toBeLessThan(0.02);
  });

  it('null si <2 points ou toutes le même jour', () => {
    expect(olsSlopePerDay([])).toBeNull();
    const same: WeightEntry[] = [
      { id: 'a', date: dayKey(subDays(new Date(), 1)), kg: 80 },
      { id: 'b', date: dayKey(subDays(new Date(), 1)), kg: 81 }
    ];
    expect(olsSlopePerDay(same)).toBeNull();
  });
});

describe('buildTrend (moyenne mobile 7j)', () => {
  it('lisse le bruit hydrique : la dernière moyenne ≈ poids réel', () => {
    const w = weightSeries({ days: 14, startKg: 85, kgPerWeek: 0.4, jitter: 0.4 });
    const trend = buildTrend(w, 14, 7).filter((p) => p.avg != null);
    expect(trend.length).toBeGreaterThan(7);
    const last = trend[trend.length - 1].avg!;
    // poids "vrai" final ≈ 85 - 0.4/7*13 = 84.26
    expect(last).toBeCloseTo(84.26, 0);
  });

  it('avg null tant qu’aucune pesée n’est disponible dans la fenêtre', () => {
    const trend = buildTrend([], 7, 7);
    expect(trend.every((p) => p.avg === null)).toBe(true);
  });
});

describe('buildValueTrend (série générique, ex. masse grasse)', () => {
  it('série clairsemée : raw seulement les jours mesurés, avg lissée sur les valeurs présentes', () => {
    // Masse grasse mesurée 1 jour sur 3 sur 9 jours (balance à impédance non systématique).
    const points = [
      { date: dayKey(subDays(new Date(), 8)), value: 20 },
      { date: dayKey(subDays(new Date(), 5)), value: 19 },
      { date: dayKey(subDays(new Date(), 2)), value: 18 }
    ];
    const trend = buildValueTrend(points, 9, 7);
    // Une valeur brute uniquement les jours mesurés.
    expect(trend.filter((p) => p.raw != null).length).toBe(3);
    // Le jour de la dernière mesure porte bien sa valeur brute.
    const measured = trend.find((p) => p.date === points[2].date)!;
    expect(measured.raw).toBe(18);
    // La moyenne mobile du dernier jour agrège les 3 mesures présentes → (20+19+18)/3 = 19.
    const last = trend[trend.length - 1];
    expect(last.raw).toBeNull();
    expect(last.avg!).toBeCloseTo(19, 5);
  });

  it('série vide → tout null', () => {
    const trend = buildValueTrend([], 7, 7);
    expect(trend.every((p) => p.raw === null && p.avg === null)).toBe(true);
  });
});

describe('trendStats (rythme hebdo)', () => {
  it('perte linéaire 0.4 kg/sem → weekly ≈ -0.4', () => {
    const w = weightSeries({ days: 21, startKg: 86, kgPerWeek: 0.4 });
    const s = trendStats(w);
    expect(s.weeklyKgPerWeek).toBeCloseTo(-0.4, 1);
    expect(s.totalKg).toBeCloseTo(-0.4 / 7 * 20, 1);
  });

  it('prise de poids → weekly positif', () => {
    const w = weightSeries({ days: 21, startKg: 80, kgPerWeek: -0.3 });
    expect(trendStats(w).weeklyKgPerWeek!).toBeGreaterThan(0);
  });

  it('aucune pesée → tout null', () => {
    expect(trendStats([])).toEqual({ weeklyKgPerWeek: null, totalKg: null, latestKg: null });
  });
});

describe('adjustmentHint (relatif à l’objectif)', () => {
  const target = 0.36; // déficit 400

  it('<7 pesées → insufficient-data, 0 kcal', () => {
    const w = weightSeries({ days: 5, startKg: 85, kgPerWeek: 0.4 });
    const h = adjustmentHint(w, target);
    expect(h.kind).toBe('insufficient-data');
    expect(h.deltaKcal).toBe(0);
  });

  it('rythme dans la cible → in-range, 0 kcal', () => {
    const w = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.4 }); // proche de 0.36
    const h = adjustmentHint(w, target);
    expect(h.kind).toBe('in-range');
    expect(h.deltaKcal).toBe(0);
  });

  it('trop lent → -150 kcal', () => {
    const w = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.05 });
    const h = adjustmentHint(w, target);
    expect(h.kind).toBe('too-slow');
    expect(h.deltaKcal).toBe(-150);
  });

  it('prise de poids alors qu’on vise une perte → too-slow (-150) + message "prends"', () => {
    const w = weightSeries({ days: 21, startKg: 85, kgPerWeek: -0.25 });
    const h = adjustmentHint(w, target);
    expect(h.kind).toBe('too-slow');
    expect(h.message).toMatch(/prends/i);
  });

  it('trop rapide → +150 kcal (préserve le muscle)', () => {
    const w = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.9 });
    const h = adjustmentHint(w, target);
    expect(h.kind).toBe('too-fast');
    expect(h.deltaKcal).toBe(150);
  });

  describe('mode Maintien (target 0)', () => {
    it('poids stable → in-range', () => {
      const w = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.0 });
      expect(adjustmentHint(w, 0).kind).toBe('in-range');
    });
    it('perte non désirée → too-fast (+150)', () => {
      const w = weightSeries({ days: 21, startKg: 85, kgPerWeek: 0.4 });
      const h = adjustmentHint(w, 0);
      expect(h.kind).toBe('too-fast');
      expect(h.deltaKcal).toBe(150);
    });
  });

  it('frontières de tolérance cohérentes avec RATE_TOLERANCE', () => {
    expect(RATE_TOLERANCE).toBe(0.2);
  });

  it('plafond physiologique 1 %/sem : perte >1 %BW → too-fast même DANS la bande du déficit', () => {
    // Sujet léger (~50 kg) perdant 0,53 kg/sem : dans la bande relative (≤0,56)
    // mais au-dessus du seuil 1 %/sem (0,50) → doit déclencher too-fast (+150).
    const w = weightSeries({ days: 21, startKg: 51.5, kgPerWeek: 0.53 });
    const h = adjustmentHint(w, 0.36);
    expect(h.kind).toBe('too-fast');
    expect(h.deltaKcal).toBe(150);
    expect(h.message).toMatch(/%\/sem/);
  });
});

describe('projectGoal (projection d’atteinte)', () => {
  it('en bonne voie : ETA renseignée et progression entre 0 et 1', () => {
    const w = weightSeries({ days: 21, startKg: 86, kgPerWeek: 0.4 });
    const p = projectGoal(w, 80)!;
    expect(p.onTrack).toBe(true);
    expect(p.weeksRemaining).toBeGreaterThan(0);
    expect(p.etaDate).not.toBeNull();
    expect(p.progress).toBeGreaterThan(0);
    expect(p.progress).toBeLessThan(1);
  });

  it('tendance à contresens (prise alors qu’on veut perdre) → pas en bonne voie, ETA null', () => {
    const w = weightSeries({ days: 21, startKg: 84, kgPerWeek: -0.3 });
    const p = projectGoal(w, 80)!;
    expect(p.onTrack).toBe(false);
    expect(p.etaDate).toBeNull();
  });

  it('objectif déjà atteint → reached', () => {
    const w = weightSeries({ days: 21, startKg: 80.02, kgPerWeek: 0.0 });
    const p = projectGoal(w, 80)!;
    expect(p.reached).toBe(true);
  });

  it('aucune pesée → null', () => {
    expect(projectGoal([], 80)).toBeNull();
  });
});

describe('weightedOlsSlopePerDay (régression pondérée par récence)', () => {
  it('série linéaire → même pente que l’OLS non pondéré (pas de biais)', () => {
    // Droite EXACTE (non arrondie) : −0,5 kg/sem. Sur une droite, la pondération ne déplace
    // pas la pente ; elle doit coïncider avec l'OLS classique et la pente théorique.
    const w: WeightEntry[] = Array.from({ length: 21 }, (_, idx) => {
      const age = 20 - idx;
      const elapsed = 20 - age; // jours depuis la pesée la plus ancienne
      return { id: `w${age}`, date: dayKey(subDays(new Date(), age)), kg: 85 - (0.5 / 7) * elapsed };
    });
    expect(weightedOlsSlopePerDay(w)!).toBeCloseTo(olsSlopePerDay(w)!, 8);
    expect(weightedOlsSlopePerDay(w)!).toBeCloseTo(-0.5 / 7, 8);
  });

  it('perte récente > perte ancienne : la pente pondérée est plus raide que l’OLS plat', () => {
    // Poids stable les 10 jours anciens, puis chute sur les 10 jours récents.
    const days = 21;
    const w: WeightEntry[] = Array.from({ length: days }, (_, idx) => {
      const age = days - 1 - idx; // idx 0 = le plus ancien (age 20), idx 20 = aujourd'hui (age 0)
      const kg = age <= 10 ? 85 - 0.05 * (10 - age) : 85; // plat puis −0,05 kg/j récemment
      return { id: `w${age}`, date: dayKey(subDays(new Date(), age)), kg };
    });
    const weighted = weightedOlsSlopePerDay(w)!;
    const plain = olsSlopePerDay(w)!;
    // Les deux voient une baisse, mais la pondérée (récence) la voit plus prononcée.
    expect(weighted).toBeLessThan(0);
    expect(weighted).toBeLessThan(plain); // plus négative = plus raide
  });

  it('<2 pesées → null', () => {
    expect(weightedOlsSlopePerDay([])).toBeNull();
    expect(weightedOlsSlopePerDay([{ id: 'a', date: dayKey(new Date()), kg: 85 }])).toBeNull();
  });
});

describe('smoothedBodyFatPct (lissage du %MG)', () => {
  /** Série de %MG sur `n` jours finissant aujourd'hui (index 0 = le plus ancien). */
  const bfSeries = (values: (number | undefined)[]): WeightEntry[] =>
    values.map((v, i) => {
      const ageDays = values.length - 1 - i;
      return {
        id: `w${ageDays}`,
        date: dayKey(subDays(new Date(), ageDays)),
        kg: 85,
        ...(v != null ? { bodyFatPct: v } : {})
      };
    });

  it('aucun %MG renseigné → null', () => {
    expect(smoothedBodyFatPct(bfSeries([undefined, undefined, undefined]))).toBeNull();
    expect(smoothedBodyFatPct([])).toBeNull();
  });

  it('lisse le bruit d’impédance : un pic isolé ne domine pas la moyenne', () => {
    // 6 jours à 15 %, puis un dernier jour aberrant à 22 % (déshydratation/mesure).
    const smoothed = smoothedBodyFatPct(bfSeries([15, 15, 15, 15, 15, 15, 22]))!;
    // La moyenne 7 j reste proche de 15, très loin de la lecture brute 22.
    expect(smoothed).toBeGreaterThan(15);
    expect(smoothed).toBeLessThan(16.5);
  });

  it('ignore les jours sans balance complète (bodyFatPct absent)', () => {
    // Valeurs présentes seulement 1 jour sur 2 : la moyenne porte sur les points existants.
    const smoothed = smoothedBodyFatPct(bfSeries([16, undefined, 16, undefined, 16, undefined, 16]))!;
    expect(smoothed).toBeCloseTo(16, 5);
  });

  it('rejette les valeurs hors plage physiologique (<=0 ou >=60)', () => {
    expect(smoothedBodyFatPct(bfSeries([0, 70, -3]))).toBeNull();
  });
});
