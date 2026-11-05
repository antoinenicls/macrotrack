import type { GoalMode, WeightEntry } from '@/types';
import { lastNDays, dayKey, addDays, subDays, parseDayKey } from './dates';

/**
 * Pente de poids (kg/JOUR) par régression linéaire (moindres carrés) sur les pesées
 * fournies. Bien plus stable que la différence de deux moyennes mobiles : utilise
 * TOUTES les pesées de la fenêtre, donc robuste à un pic isolé (rétention d'eau après
 * un cheat meal) qui, sur un bord de moyenne mobile, fausserait le rythme.
 * Renvoie null si <2 pesées ou si elles tombent toutes le même jour (x constant).
 */
export function olsSlopePerDay(entries: WeightEntry[]): number | null {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = parseDayKey(sorted[0].date).getTime();
  // Arrondi : à minuit LOCAL, un jour de changement d'heure dure 23 h ou 25 h.
  const xs = sorted.map((e) => Math.round((parseDayKey(e.date).getTime() - t0) / 86_400_000));
  const ys = sorted.map((e) => e.kg);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den < 1e-9) return null;
  return num / den;
}

/**
 * Pente de poids (kg/JOUR) par régression linéaire PONDÉRÉE (moindres carrés pondérés) :
 * chaque pesée pèse `0.5^(âge_depuis_la_plus_récente / halfLifeDays)`, donc les jours récents
 * comptent davantage que les anciens. Sert au bilan énergétique sur une fenêtre LONGUE (dilue
 * l'eau/le glycogène des tout premiers jours de sèche) sans perdre en réactivité (le poids
 * d'aujourd'hui reste prépondérant). `olsSlopePerDay` en est le cas particulier halfLife = ∞.
 * Renvoie null si <2 pesées ou si elles tombent toutes le même jour (x constant).
 */
export function weightedOlsSlopePerDay(entries: WeightEntry[], halfLifeDays = 10): number | null {
  if (entries.length < 2) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = parseDayKey(sorted[0].date).getTime();
  const tNewest = parseDayKey(sorted[sorted.length - 1].date).getTime();
  const decay = Math.LN2 / halfLifeDays;
  let W = 0, mx = 0, my = 0;
  const pts = sorted.map((e) => {
    const t = parseDayKey(e.date).getTime();
    const x = Math.round((t - t0) / 86_400_000);
    const ageFromNewest = Math.round((tNewest - t) / 86_400_000);
    const w = Math.exp(-decay * ageFromNewest);
    W += w; mx += w * x; my += w * e.kg;
    return { x, y: e.kg, w };
  });
  if (W < 1e-9) return null;
  mx /= W; my /= W;
  let num = 0, den = 0;
  for (const p of pts) {
    num += p.w * (p.x - mx) * (p.y - my);
    den += p.w * (p.x - mx) ** 2;
  }
  if (den < 1e-9) return null;
  return num / den;
}

/**
 * Moyenne mobile à `window` jours (par défaut 7) sur les pesées.
 * Retourne, pour chaque jour de la fenêtre `dateRange`, la moyenne des `window` derniers
 * jours qui comportent une pesée (lissage des fluctuations hydriques).
 */
export interface TrendPoint {
  date: string;
  raw: number | null;
  avg: number | null;
}

/** Point daté d'une série numérique quelconque (poids, masse grasse, …). */
export interface DatedValue {
  date: string; // YYYY-MM-DD
  value: number;
}

/**
 * Moyenne mobile sur une série datée générique — même logique que {@link buildTrend}
 * mais sur n'importe quel indicateur (poids, masse grasse…). Gère les séries clairsemées
 * (ex. masse grasse renseignée seulement les jours avec balance complète) : la moyenne
 * porte sur les `window` dernières valeurs présentes, en remontant jusqu'à 30 jours.
 */
export function buildValueTrend(points: DatedValue[], days = 30, window = 7): TrendPoint[] {
  const map = new Map<string, number>();
  for (const p of points) map.set(p.date, p.value);

  const dates = lastNDays(days);
  return dates.map((d) => {
    const raw = map.get(d) ?? null;
    const lookback: number[] = [];
    const start = new Date(d);
    for (let i = 0; i < 30 && lookback.length < window; i++) {
      const probe = new Date(start);
      probe.setDate(probe.getDate() - i);
      const k = probe.toISOString().slice(0, 10);
      const v = map.get(k);
      if (v != null) lookback.push(v);
    }
    const avg = lookback.length === 0 ? null : lookback.reduce((a, b) => a + b, 0) / lookback.length;
    return { date: d, raw, avg };
  });
}

export function buildTrend(entries: WeightEntry[], days = 30, window = 7): TrendPoint[] {
  return buildValueTrend(entries.map((e) => ({ date: e.date, value: e.kg })), days, window);
}

/**
 * Statistiques rapides : variation hebdo (kg/sem) basée sur la moyenne mobile.
 * Compare la dernière moyenne disponible à celle d'il y a 7 jours.
 */
export function trendStats(entries: WeightEntry[]): {
  weeklyKgPerWeek: number | null;
  totalKg: number | null;
  latestKg: number | null;
} {
  if (entries.length === 0) return { weeklyKgPerWeek: null, totalKg: null, latestKg: null };

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const latestKg = sorted[sorted.length - 1].kg;
  const totalKg = latestKg - sorted[0].kg;

  // Rythme hebdo par régression linéaire sur les pesées des 21 derniers jours :
  // plus robuste qu'une différence de moyennes mobiles (insensible à un pic isolé).
  const since = dayKey(subDays(new Date(), 20));
  const recent = sorted.filter((e) => e.date >= since);
  const slope = olsSlopePerDay(recent);
  const weekly = slope == null ? null : slope * 7;

  return { weeklyKgPerWeek: weekly, totalKg, latestKg };
}

/**
 * Recommandation d'ajustement calorique, RELATIVE À L'OBJECTIF et à la DIRECTION.
 * On vise un rythme = `targetLossKgPerWeek` (déduit du déficit signé : déficit·7 / 7700 ;
 * négatif = cible de GAIN). Une marge de ±`RATE_TOLERANCE` autour de cette cible définit
 * la zone « dans la cible ».
 *  - En SÈCHE / MAINTIEN (`mode` 'cut'/'maintain') :
 *    - rythme nettement plus lent que la cible (ou prise de poids) → -150 kcal
 *    - rythme nettement plus rapide que la cible → +150 kcal (préserve le muscle / évite
 *      de perdre alors qu'on vise le maintien)
 *    En Maintien (cible = 0), la zone neutre est ±RATE_TOLERANCE autour de 0.
 *  - En PRISE DE MASSE (`mode` 'bulk', cible de gain > 0) — miroir :
 *    - prise trop lente (ou perte) → +150 kcal (relève le surplus)
 *    - prise trop rapide / au-delà du plafond anti-gras → -150 kcal (réduit le surplus)
 * `kind` reste 'too-slow'/'too-fast' au sens du RYTHME (lent/rapide vs cible) ; c'est
 * `deltaKcal` qui porte le bon signe selon la direction.
 */
export type AdjustmentHint = {
  kind: 'in-range' | 'too-slow' | 'too-fast' | 'insufficient-data';
  deltaKcal: number;
  weeklyKgPerWeek: number | null;
  message: string;
};

/** Marge (kg/sem) autour du rythme visé avant de déclencher une correction. */
export const RATE_TOLERANCE = 0.2;

/**
 * Plafond PHYSIOLOGIQUE de prise (fraction du poids/sem) : au-delà, le surplus part
 * surtout en gras (Aragon/Helms). Un peu plus permissif que la borne haute conseillée
 * (0,5 %/sem) pour ne corriger que les emballements francs. Exprimé en % du poids →
 * scale tout seul à mesure qu'on grossit.
 */
const FAST_GAIN_CEILING_FRACTION = 0.0075;

/**
 * Projection d'atteinte d'un poids cible à partir de la tendance hebdo.
 * Renvoie null s'il n'y a aucune pesée. `weeksRemaining`/`etaDate` sont null si
 * la tendance ne va pas vers la cible (ou est plate) → "pas en bonne voie".
 */
export interface GoalProjection {
  goalKg: number;
  startKg: number;
  currentKg: number;
  /** Reste à parcourir (kg, valeur absolue). */
  remainingKg: number;
  /** Part du chemin déjà fait (0..1) entre départ et cible. */
  progress: number;
  weeklyKgPerWeek: number | null;
  /** En bonne voie si la tendance va dans le sens de la cible. */
  onTrack: boolean;
  reached: boolean;
  weeksRemaining: number | null;
  etaDate: string | null;
}

/** Poids LISSÉ courant = dernière moyenne mobile 7 j disponible (null si aucune pesée). */
export function smoothedCurrentKg(entries: WeightEntry[]): number | null {
  const trend = buildTrend(entries, 7, 7).filter((p) => p.avg != null);
  return trend.length ? trend[trend.length - 1].avg! : null;
}

/**
 * %MG LISSÉ courant = moyenne mobile des dernières lectures d'impédance (null si aucune).
 * Le %MG d'une balance à impédance oscille de plusieurs points d'un jour à l'autre (état
 * d'hydratation, repas, heure), or il pilote toute une cascade (BMR Katch-McArdle, fourchette
 * de rythme, plafond de déficit, cible protéique). Nourrir le coach avec la lecture BRUTE la
 * plus récente fait vibrer ces garde-fous ; on lisse d'abord. Les jours sans balance complète
 * (bodyFatPct absent) sont ignorés — la moyenne remonte jusqu'à 30 j pour trouver ses points.
 */
export function smoothedBodyFatPct(entries: WeightEntry[], window = 7): number | null {
  const points: DatedValue[] = [];
  for (const e of entries) {
    if (typeof e.bodyFatPct === 'number' && e.bodyFatPct > 0 && e.bodyFatPct < 60) {
      points.push({ date: e.date, value: e.bodyFatPct });
    }
  }
  if (points.length === 0) return null;
  const trend = buildValueTrend(points, 30, window).filter((p) => p.avg != null);
  return trend.length ? trend[trend.length - 1].avg! : null;
}

export function projectGoal(entries: WeightEntry[], goalKg: number): GoalProjection | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const startKg = sorted[0].kg;
  const stats = trendStats(entries);
  const currentKg = stats.latestKg ?? startKg;
  const weekly = stats.weeklyKgPerWeek;

  const need = goalKg - currentKg;          // <0 : il faut perdre ; >0 : il faut prendre
  const reached = Math.abs(need) < 0.05;
  const span = startKg - goalKg;
  const progress = Math.abs(span) < 1e-6 ? 1 : clamp01((startKg - currentKg) / span);

  // En bonne voie : la tendance va dans le même sens que ce qu'il reste à faire.
  const onTrack = !reached && weekly != null && Math.sign(weekly) === Math.sign(need) && Math.abs(weekly) > 0.02;
  const weeksRemaining = onTrack ? Math.abs(need) / Math.abs(weekly!) : null;
  const etaDate = weeksRemaining != null ? dayKey(addDays(new Date(), Math.round(weeksRemaining * 7))) : null;

  return {
    goalKg, startKg, currentKg,
    remainingKg: Math.abs(need),
    progress,
    weeklyKgPerWeek: weekly,
    onTrack, reached, weeksRemaining, etaDate
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function adjustmentHint(entries: WeightEntry[], targetLossKgPerWeek = 0.4, mode: GoalMode = 'cut'): AdjustmentHint {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 7) {
    return {
      kind: 'insufficient-data',
      deltaKcal: 0,
      weeklyKgPerWeek: null,
      message: 'Continue à te peser chaque matin : besoin de ~7 jours pour calibrer.'
    };
  }
  const stats = trendStats(entries);
  const w = stats.weeklyKgPerWeek;
  if (w == null) {
    return { kind: 'insufficient-data', deltaKcal: 0, weeklyKgPerWeek: null, message: 'Données insuffisantes pour une recommandation fiable.' };
  }

  // Prise de masse : logique MIROIR de la sèche, exprimée en GAIN visé (positif).
  if (mode === 'bulk') {
    const gain = w;                              // prise réelle kg/sem (positif = prise)
    const targetGain = -targetLossKgPerWeek;     // cible de gain (>0 ; deficit négatif → gain)
    const low = targetGain - RATE_TOLERANCE;     // sous ce rythme : prise trop lente
    const high = targetGain + RATE_TOLERANCE;    // au-dessus : prise trop rapide
    const currentKg = stats.latestKg ?? 0;
    const fastGainCeilingKg = currentKg > 0 ? FAST_GAIN_CEILING_FRACTION * currentKg : Infinity;
    const overCeiling = gain > fastGainCeilingKg;

    if (gain < low) {
      // Prise trop lente — ou perte non désirée. On RELÈVE le surplus (+150).
      const losing = gain < -0.01;
      const message = losing
        ? `Tu perds ${Math.abs(gain).toFixed(2)} kg/sem au lieu de prendre ~${targetGain.toFixed(2)} → cible relevée de ~150 kcal/jour.`
        : `Prise trop lente (${gain.toFixed(2)} vs ~${targetGain.toFixed(2)} kg/sem visés) → cible relevée de ~150 kcal/jour.`;
      return { kind: 'too-slow', deltaKcal: +150, weeklyKgPerWeek: w, message };
    }
    if (gain > high || overCeiling) {
      // Prise trop rapide / au-delà du plafond anti-gras. On RÉDUIT le surplus (−150).
      const pctBW = currentKg > 0 ? (gain / currentKg) * 100 : 0;
      const message = overCeiling
        ? `Prise trop rapide (${gain.toFixed(2)} kg/sem ≈ ${pctBW.toFixed(1)} %/sem) : au-delà, la prise est surtout du gras → cible réduite de ~150 kcal/jour.`
        : `Prise trop rapide (${gain.toFixed(2)} vs ~${targetGain.toFixed(2)} kg/sem visés) → cible réduite de ~150 kcal/jour pour limiter le gras.`;
      return { kind: 'too-fast', deltaKcal: -150, weeklyKgPerWeek: w, message };
    }
    const message = `Tu es dans la cible (${gain.toFixed(2)} kg/sem de prise, visé ~${targetGain.toFixed(2)}) 👍`;
    return { kind: 'in-range', deltaKcal: 0, weeklyKgPerWeek: w, message };
  }

  const loss = -w;                              // perte réelle kg/sem (négatif = prise)
  const isMaintain = targetLossKgPerWeek < 0.05;
  const low = targetLossKgPerWeek - RATE_TOLERANCE;   // sous ce rythme : trop lent
  const high = targetLossKgPerWeek + RATE_TOLERANCE;  // au-dessus : trop rapide
  // Plafond PHYSIOLOGIQUE de sécurité : au-delà de ~1 %/sem du poids, la perte
  // attaque le muscle (Garthe 2011). Exprimé en % du poids, il « scale » tout seul
  // à mesure qu'on s'allège — contrairement à une borne absolue en kg.
  const currentKg = stats.latestKg ?? 0;
  const fastCeilingKg = currentKg > 0 ? 0.01 * currentKg : Infinity;
  const overCeiling = loss > fastCeilingKg;

  if (loss < low) {
    // Trop lent par rapport à l'objectif — ou prise de poids non désirée.
    const gaining = loss < -0.01;
    const message = gaining
      ? (isMaintain
          ? `Tu prends ${Math.abs(loss).toFixed(2)} kg/sem alors que tu vises le maintien → cible réduite de ~150 kcal/jour.`
          : `Tu prends ${Math.abs(loss).toFixed(2)} kg/sem au lieu de perdre ~${targetLossKgPerWeek.toFixed(2)} → cible réduite de ~150 kcal/jour.`)
      : `Perte trop lente (${loss.toFixed(2)} vs ~${targetLossKgPerWeek.toFixed(2)} kg/sem visés) → cible réduite de ~150 kcal/jour.`;
    return { kind: 'too-slow', deltaKcal: -150, weeklyKgPerWeek: w, message };
  }
  if (loss > high || overCeiling) {
    const pctBW = currentKg > 0 ? (loss / currentKg) * 100 : 0;
    const message = overCeiling
      ? `Perte trop rapide (${loss.toFixed(2)} kg/sem ≈ ${pctBW.toFixed(1)} %/sem, au-delà du seuil de sécurité 1 %/sem) → cible relevée de ~150 kcal/jour pour préserver le muscle.`
      : isMaintain
      ? `Tu perds ${loss.toFixed(2)} kg/sem alors que tu vises le maintien → cible relevée de ~150 kcal/jour.`
      : `Perte trop rapide (${loss.toFixed(2)} vs ~${targetLossKgPerWeek.toFixed(2)} kg/sem visés) → cible relevée de ~150 kcal/jour pour préserver le muscle.`;
    return { kind: 'too-fast', deltaKcal: +150, weeklyKgPerWeek: w, message };
  }
  const message = isMaintain
    ? `Poids stable (${loss >= 0 ? '−' : '+'}${Math.abs(loss).toFixed(2)} kg/sem) : tu es bien au maintien 👍`
    : `Tu es dans la cible (${loss.toFixed(2)} kg/sem, visé ~${targetLossKgPerWeek.toFixed(2)}) 👍`;
  return { kind: 'in-range', deltaKcal: 0, weeklyKgPerWeek: w, message };
}
