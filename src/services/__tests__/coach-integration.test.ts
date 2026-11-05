import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import type { Food, Meal, WeightEntry, PlanTemplateMeal } from '@/types';
import { dayKey, subDays } from '@/lib/dates';
import { proteinTargetG } from '@/lib/nutrition';

/* =========================================================================
 *  Tests d'INTÉGRATION sur IndexedDB (faked) : seed, backfill du coach,
 *  et le flux complet pesée → recalcul de cible → re-scaling du plan.
 *  Chaque test repart d'une base + d'un graphe de modules vierges.
 * ========================================================================= */

// Profil seedé figé pour ces tests : les attendus sont calibrés dessus, ils ne
// doivent pas bouger quand le profil par défaut livré avec l'app change.
vi.mock('@/data/seedProfile', () => ({
  SEED_PROFILE: {
    id: 'me', sex: 'M', ageYears: 21, heightCm: 180, weightKg: 84.85, bodyFatPct: 15,
    activity: 'moderate', targetKcal: 2450, targetProteinG: 187, targetFatG: 75,
    targetCarbsG: 255, proteinPerKg: 2.2, fatPerKg: 0.8, updatedAt: 0
  }
}));

beforeEach(() => {
  // Base + cache de connexion remis à zéro entre chaque test.
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
});

/** Aliment « 1 kcal/g » mis en base pour que byId() le résolve dans le store. */
const KCAL_FOOD: Food = {
  id: 'kcal', name: 'kcal', kcalPer100g: 100, proteinPer100g: 10,
  carbsPer100g: 12, fatPer100g: 2, category: 'autre', isCustom: false, state: 'raw', createdAt: 0
};

function weights(days: number, startKg: number, kgPerWeek: number): WeightEntry[] {
  const out: WeightEntry[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const elapsed = days - 1 - i;
    out.push({ id: `w${i}`, date: dayKey(subDays(new Date(), i)), kg: startKg - (kgPerWeek / 7) * elapsed });
  }
  return out;
}
function meals(days: number, kcal: number): Meal[] {
  const out: Meal[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push({ id: `m${i}`, date: dayKey(subDays(new Date(), i)), slot: 'dejeuner',
      items: [{ foodId: 'kcal', grams: kcal, cooked: false }], createdAt: 0 });
  }
  return out;
}

describe('seed : coach actif par défaut', () => {
  it('install neuve → adaptiveTargets = true, déficit 400', async () => {
    const { ensureSeeded } = await import('@/services/seed');
    const { settingsRepo } = await import('@/services/repositories');
    await ensureSeeded();
    const s = await settingsRepo.get();
    expect(s?.adaptiveTargets).toBe(true);
    expect(s?.deficitKcal).toBe(400);
  });
});

describe('seed : backfill des installs existantes', () => {
  it('settings ancien sans adaptiveTargets → activé par le backfill', async () => {
    const { settingsRepo } = await import('@/services/repositories');
    const { SEED_PLAN_TEMPLATE } = await import('@/data/seedPlan');
    // Simule une install d'avant le correctif : flag absent.
    await settingsRepo.put({
      id: 'app', theme: 'light', units: 'metric', lastSeedVersion: 0, planTemplate: SEED_PLAN_TEMPLATE
    });
    const { ensureSeeded } = await import('@/services/seed');
    await ensureSeeded();
    const s = await settingsRepo.get();
    expect(s?.adaptiveTargets).toBe(true);
    expect(s?.deficitKcal).toBe(400);
  });

  it('respecte un déficit déjà choisi (n’écrase pas)', async () => {
    const { settingsRepo } = await import('@/services/repositories');
    const { SEED_PLAN_TEMPLATE } = await import('@/data/seedPlan');
    await settingsRepo.put({
      id: 'app', theme: 'light', units: 'metric', lastSeedVersion: 0,
      planTemplate: SEED_PLAN_TEMPLATE, deficitKcal: 500 // déficit déjà réglé, flag absent
    });
    const { ensureSeeded } = await import('@/services/seed');
    await ensureSeeded();
    const s = await settingsRepo.get();
    expect(s?.adaptiveTargets).toBe(true);
    expect(s?.deficitKcal).toBe(500); // préservé
  });

  it('lipides : l’ancien défaut 0,9 g/kg passe à 0,8, un autre réglage est conservé', async () => {
    const { profileRepo } = await import('@/services/repositories');
    const { SEED_PROFILE } = await import('@/data/seedProfile');
    const { ensureSeeded } = await import('@/services/seed');
    await profileRepo.put({ ...SEED_PROFILE, fatPerKg: 0.9 });
    await ensureSeeded();
    expect((await profileRepo.get())?.fatPerKg).toBe(0.8);
    await profileRepo.put({ ...SEED_PROFILE, fatPerKg: 1.1 });
    await ensureSeeded();
    expect((await profileRepo.get())?.fatPerKg).toBe(1.1);
  });
});

describe('flux complet : pesée → recalcul cible → re-scaling plan', () => {
  async function bootWith(w: WeightEntry[], m: Meal[]) {
    const { ensureSeeded } = await import('@/services/seed');
    const { weightsRepo, mealsRepo, foodsRepo } = await import('@/services/repositories');
    await ensureSeeded();
    await foodsRepo.put(KCAL_FOOD);
    for (const e of w) await weightsRepo.put(e);
    for (const e of m) await mealsRepo.put(e);
    const { useProfileStore } = await import('@/store/profileStore');
    const { useFoodsStore } = await import('@/store/foodsStore');
    const { useWeightStore } = await import('@/store/weightStore');
    await useFoodsStore.getState().load();
    await useWeightStore.getState().load();
    await useProfileStore.getState().load();
    return { useProfileStore };
  }

  it('maintenance mesurée 2700 (poids stable, apport 2700) → cible 2300 appliquée', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    await useProfileStore.getState().recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    expect(p.targetKcal).toBeGreaterThanOrEqual(2280);
    expect(p.targetKcal).toBeLessThanOrEqual(2320); // 2700 - 400
    // Protéines tenues haut (~2.2 g/kg) malgré le recalcul.
    expect(p.targetProteinG).toBeGreaterThanOrEqual(180);
  });

  it('rythme %/sem : déficit DÉRIVÉ du poids courant (0,5 % → ~468 kcal, cache rafraîchi)', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, lossRatePctPerWeek: 0.5 });
    await st.recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    const s = useProfileStore.getState().settings!;
    // 0,5 % × 85 kg × 7700/7 ≈ 468 kcal ; maintenance mesurée 2700 → cible ≈ 2232.
    expect(p.targetKcal).toBeGreaterThanOrEqual(2210);
    expect(p.targetKcal).toBeLessThanOrEqual(2255);
    expect(s.deficitKcal).toBeGreaterThanOrEqual(455);
    expect(s.deficitKcal).toBeLessThanOrEqual(480);
    expect(s.lossRatePctPerWeek).toBe(0.5); // rythme = source de vérité, conservé
  });

  it('rythme 1 %/sem → déficit demandé agressif MAIS cible plafonnée (préservation musculaire)', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 3100));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, lossRatePctPerWeek: 1.0 });
    await st.recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    const s = useProfileStore.getState().settings!;
    // Le rythme demandé reste mémorisé (≈935 kcal), MAIS la cible ne descend pas jusqu'à
    // 3100 − 935 = 2165 : elle est plafonnée à 20 % de la maintenance (%MG modéré) = 2480.
    // C'est le garde-fou anti-fonte musculaire : perdre plus vite = plus de dépense, pas
    // un déficit qui rapproche du BMR.
    expect(s.deficitKcal).toBeGreaterThan(900);
    expect(p.targetKcal).toBe(Math.round(3100 * 0.8));
    expect(p.targetKcal).toBeGreaterThan(2165);
  });

  it('pause diète : cible tenue à la maintenance, une pesée ne la fait plus bouger', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const st = useProfileStore.getState();
    // Sèche 0,5 %/sem d'abord : cible sous la maintenance.
    await st.saveSettings({ ...st.settings!, lossRatePctPerWeek: 0.5 });
    await st.recalcTargetsFromWeight();
    const cutTarget = useProfileStore.getState().profile!.targetKcal!;
    expect(cutTarget).toBeLessThan(2500);

    // Passage en pause : la cible remonte à la maintenance mesurée (~2700).
    await useProfileStore.getState().setDietPaused(true);
    const paused = useProfileStore.getState().profile!.targetKcal!;
    expect(useProfileStore.getState().settings!.dietPaused).toBe(true);
    expect(paused).toBeGreaterThanOrEqual(2650);

    // Une pesée pendant la pause ne relance PAS le déficit.
    await useProfileStore.getState().recalcTargetsFromWeight();
    expect(useProfileStore.getState().profile!.targetKcal).toBe(paused);

    // Reprise : la cible de sèche est rétablie.
    await useProfileStore.getState().setDietPaused(false);
    expect(useProfileStore.getState().settings!.dietPaused).toBe(false);
    expect(useProfileStore.getState().profile!.targetKcal).toBeLessThan(2500);
  });

  it('récupération : la cible vise la maintenance THÉORIQUE, pas la mesurée déprimée', async () => {
    // Logs bas (1800) → maintenance mesurée déprimée. La récup ne doit PAS s'y caler.
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 1800));
    const { tdee } = await import('@/lib/nutrition');
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, goalMode: 'maintain', deficitKcal: 0,
      lossRatePctPerWeek: 0, recoveryStartedAt: Date.now(), cutStartedAt: undefined });
    await useProfileStore.getState().recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    expect(p.targetKcal).toBe(Math.round(tdee(p)));  // maintenance théorique, pas 1800
    expect(p.targetKcal!).toBeGreaterThan(2000);
  });

  it('reprise post-récup : resumeCut repose une sèche fraîche et efface le marqueur de récup', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const st = useProfileStore.getState();
    // Simule une récup en cours (marqueur posé il y a 3 semaines) en Maintien.
    await st.saveSettings({
      ...st.settings!, goalMode: 'maintain', deficitKcal: 0, lossRatePctPerWeek: 0,
      recoveryStartedAt: Date.now() - 21 * 86_400_000, cutStartedAt: undefined
    });
    await useProfileStore.getState().resumeCut(0.5);
    const s = useProfileStore.getState().settings!;
    const p = useProfileStore.getState().profile!;
    expect(s.recoveryStartedAt).toBeUndefined();       // marqueur effacé
    expect(s.goalMode).toBe('cut');
    expect(s.lossRatePctPerWeek).toBe(0.5);
    expect(s.cutStartedAt).toBeGreaterThan(0);          // nouvelle phase de sèche
    expect(p.targetKcal!).toBeLessThan(2700);          // déficit à nouveau appliqué
  });

  it('calibre et persiste le facteur d’activité réel quand la maintenance est mesurée', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    await useProfileStore.getState().recalcTargetsFromWeight();
    const f = useProfileStore.getState().settings!.measuredActivityFactor!;
    // 2700 / BMR(~1928) ≈ 1.40, dans [1.2, 2.2].
    expect(f).toBeGreaterThan(1.3);
    expect(f).toBeLessThan(1.5);
  });

  it('gèle cutBaselineFactor au 1er relevé mesuré de la sèche (= facteur mesuré, figé ensuite)', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, goalMode: 'cut', lossRatePctPerWeek: 0.5 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    const s1 = useProfileStore.getState().settings!;
    expect(s1.cutStartedAt).toBeGreaterThan(0);
    // Gelé sur le facteur mesuré de ce relevé (≈ 1.40), et NON le générique 1.5.
    expect(s1.cutBaselineFactor).toBe(s1.measuredActivityFactor);
    expect(s1.cutBaselineFactor!).toBeGreaterThan(1.3);
    expect(s1.cutBaselineFactor!).toBeLessThan(1.5);

    // Un second recalcul ne le RÉ-écrit pas (référentiel figé pour toute la sèche).
    const frozen = s1.cutBaselineFactor!;
    await useProfileStore.getState().recalcTargetsFromWeight();
    expect(useProfileStore.getState().settings!.cutBaselineFactor).toBe(frozen);
  });

  it('efface cutBaselineFactor au passage en maintien', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, goalMode: 'cut', lossRatePctPerWeek: 0.5 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    expect(useProfileStore.getState().settings!.cutBaselineFactor).toBeGreaterThan(0);

    // Bascule en maintien : la sèche s'arrête, le référentiel doit être remis à zéro.
    const st2 = useProfileStore.getState();
    await st2.saveSettings({ ...st2.settings!, goalMode: 'maintain', deficitKcal: 0, lossRatePctPerWeek: 0 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    expect(useProfileStore.getState().settings!.cutBaselineFactor).toBeUndefined();
  });

  it('refeed 1-tap : re-scale le jour à la maintenance, puis clearRefeedToday reverte', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const { useFoodsStore } = await import('@/store/foodsStore');
    const { macrosForItem } = await import('@/lib/nutrition');
    const { getTemplateForDate } = await import('@/lib/templates');
    const st = useProfileStore.getState();
    // Sèche → un refeed devient applicable.
    await st.saveSettings({ ...st.settings!, goalMode: 'cut', lossRatePctPerWeek: 0.5 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    const cutTarget = useProfileStore.getState().profile!.targetKcal!;

    const byId = useFoodsStore.getState().byId;
    const dayKcal = (plan: PlanTemplateMeal[]) =>
      plan.reduce((k, m) => k + m.items.reduce(
        (kk, it) => kk + macrosForItem(byId(it.foodId), { foodId: it.foodId, grams: it.grams, cooked: it.cooked }).kcal, 0), 0);

    const today = dayKey(new Date());
    await useProfileStore.getState().applyRefeedToday();
    const s1 = useProfileStore.getState().settings!;
    expect(s1.lastRefeedDate).toBe(today);
    expect(s1.planSnapshots?.[today]?.length ?? 0).toBeGreaterThan(0);
    // Le menu du jour repasse à la maintenance mesurée (2700), au-dessus de la cible de sèche.
    expect(dayKcal(getTemplateForDate(today, s1))).toBeGreaterThan(cutTarget + 150);

    // Annulation : snapshot du jour + marqueur retirés → retour au plan de sèche.
    await useProfileStore.getState().clearRefeedToday();
    const s2 = useProfileStore.getState().settings!;
    expect(s2.lastRefeedDate).toBeUndefined();
    expect(s2.planSnapshots?.[today]).toBeUndefined();
  });

  it('refeed : no-op hors sèche (maintien → rien appliqué)', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, goalMode: 'maintain', deficitKcal: 0, lossRatePctPerWeek: 0 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    await useProfileStore.getState().applyRefeedToday();
    expect(useProfileStore.getState().settings!.lastRefeedDate).toBeUndefined();
  });

  it('sous-loggage massif (mesurée aberrante) → cible calée sur la théorique, PAS collée au BMR, et facteur pollué réinitialisé', async () => {
    // Le cas signalé : ~950 kcal loggés/j alors que le poids ne baisse pas → maintenance
    // mesurée absurde (sous le BMR). Sèche 0,5 %/sem.
    const { useProfileStore } = await bootWith(weights(18, 85, 0), meals(18, 950));
    const { bmr } = await import('@/lib/nutrition');
    const st = useProfileStore.getState();
    // Simule un facteur d'activité DÉJÀ pollué vers le bas par des spirales passées.
    await st.saveSettings({ ...st.settings!, goalMode: 'cut', lossRatePctPerWeek: 0.5, measuredActivityFactor: 1.2 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    const s = useProfileStore.getState().settings!;
    const bmrK = Math.round(bmr(p));
    // La cible ne se colle plus au BMR : elle est nettement au-dessus (théorique − déficit).
    expect(p.targetKcal!).toBeGreaterThan(bmrK + 250);
    // Le facteur pollué a été effacé (repli sur le niveau d'activité déclaré).
    expect(s.measuredActivityFactor).toBeUndefined();
  });

  it('protéines calées sur la masse maigre en sèche, selon la sécheresse (2,4–3,0 g/kg MM)', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    await useProfileStore.getState().recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    const s = useProfileStore.getState().settings!;
    // Même formule que la cible appliquée (masse maigre, déficit courant).
    expect(p.targetProteinG!).toBe(proteinTargetG(p, s.deficitKcal ?? 0));
    const lbm = p.weightKg * (1 - (p.bodyFatPct ?? 0) / 100);
    expect(p.targetProteinG! / lbm).toBeGreaterThanOrEqual(2.39);
    expect(p.targetProteinG! / lbm).toBeLessThanOrEqual(3.01);
    expect(p.targetProteinG!).toBeGreaterThanOrEqual(Math.round(1.8 * p.weightKg));
  });

  it('le plan de la semaine est rescalé sur la nouvelle cible', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    await useProfileStore.getState().recalcTargetsFromWeight();
    const s = useProfileStore.getState().settings!;
    expect(s.weeklyTemplates && Object.keys(s.weeklyTemplates).length).toBe(7);
  });

  it('ne fige PAS le plan du jour si la journée n’est pas entamée (menu à jour tout de suite)', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    await useProfileStore.getState().recalcTargetsFromWeight();
    const s = useProfileStore.getState().settings!;
    // Aucun aliment du plan coché aujourd’hui → pas de gel : la nouvelle cible s’applique
    // directement au menu du jour (pas de snapshot figé).
    expect(s.planSnapshots?.[dayKey(new Date())]).toBeUndefined();
  });

  it('fige le plan du jour si un aliment du plan a déjà été coché aujourd’hui', async () => {
    const today = dayKey(new Date());
    const m = meals(14, 2700);
    // Journée entamée : un aliment ISSU DU PLAN (fromTemplate) est déjà coché aujourd’hui.
    m.push({ id: 'today-tpl', date: today, slot: 'petit-dej',
      items: [{ foodId: 'kcal', grams: 300, cooked: false, fromTemplate: true }], createdAt: 0 });
    const { useProfileStore } = await bootWith(weights(14, 85, 0), m);
    await useProfileStore.getState().recalcTargetsFromWeight();
    const s = useProfileStore.getState().settings!;
    // Journée protégée : le plan du jour est figé (le changement s’appliquera demain).
    expect(s.planSnapshots?.[today]).toBeDefined();
  });

  it('garde anti-bruit : un 2e recalcul identique ne change rien', async () => {
    const { useProfileStore } = await bootWith(weights(14, 85, 0), meals(14, 2700));
    await useProfileStore.getState().recalcTargetsFromWeight();
    const k1 = useProfileStore.getState().profile!.targetKcal;
    await useProfileStore.getState().recalcTargetsFromWeight();
    const k2 = useProfileStore.getState().profile!.targetKcal;
    expect(k2).toBe(k1);
  });

  it('PRISE DE MASSE : rythme de gain → surplus dérivé, cible > maintenance, bulkStartedAt posé', async () => {
    const { useProfileStore } = await bootWith(weights(14, 82, 0), meals(14, 2450));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, goalMode: 'bulk', gainRatePctPerWeek: 0.25 });
    await st.recalcTargetsFromWeight();
    const p = useProfileStore.getState().profile!;
    const s = useProfileStore.getState().settings!;
    // 0,25 % × 82 kg × 7700/7 ≈ 226 kcal de surplus → deficitKcal signé négatif.
    expect(s.deficitKcal!).toBeLessThan(0);
    expect(s.deficitKcal!).toBeGreaterThanOrEqual(-245);
    expect(s.deficitKcal!).toBeLessThanOrEqual(-205);
    expect(p.targetKcal!).toBeGreaterThan(2450);   // maintenance mesurée 2450 + surplus
    expect(s.bulkStartedAt).toBeDefined();
    expect(s.cutStartedAt).toBeUndefined();
  });

  it('PRISE DE MASSE : objectif de poids atteint (en montant) → bascule maintien', async () => {
    const { useProfileStore } = await bootWith(weights(14, 82, 0), meals(14, 2450));
    const st = useProfileStore.getState();
    await st.saveSettings({ ...st.settings!, goalMode: 'bulk', gainRatePctPerWeek: 0.25 });
    // Objectif 82 kg déjà atteint (poids lissé ~82 ≥ 82 − 0,1) → la pesée bascule en maintien.
    await st.saveProfile({ ...st.profile!, goalWeightKg: 82 });
    await useProfileStore.getState().recalcTargetsFromWeight();
    const s = useProfileStore.getState().settings!;
    expect(s.goalMode).toBe('maintain');
    expect(s.deficitKcal).toBe(0);
    expect(s.gainRatePctPerWeek).toBe(0);
    expect(s.goalReachedAt).toBeDefined();
    expect(s.bulkStartedAt).toBeUndefined();
  });

  it('loguer un nouveau %MG rafraîchit les protéines même si les calories ne bougent pas', async () => {
    const { useProfileStore } = await bootWith(weights(14, 84.85, 0), meals(14, 2700));
    const { useWeightStore } = await import('@/store/weightStore');
    await useProfileStore.getState().recalcTargetsFromWeight();
    const p1 = useProfileStore.getState().profile!.targetProteinG!;
    const k1 = useProfileStore.getState().profile!.targetKcal!;
    // MG 15% → 25% (masse maigre plus faible) via une pesée, poids inchangé : la
    // maintenance mesurée garde les calories, mais les protéines doivent redescendre.
    await useWeightStore.getState().upsertWeight(dayKey(new Date()), 84.85, 25);
    const p2 = useProfileStore.getState().profile!.targetProteinG!;
    const k2 = useProfileStore.getState().profile!.targetKcal!;
    expect(Math.abs(k2 - k1)).toBeLessThan(25); // calories quasi inchangées (mesurée)
    expect(p2).toBeLessThan(p1 - 10);           // protéines revues à la baisse (masse maigre ↓)
  });
});

describe('bascule auto en maintien à l’objectif', () => {
  it('poids cible atteint (lissé) → déficit passé à 0, goalReachedAt posé, cible relevée', async () => {
    const { ensureSeeded } = await import('@/services/seed');
    const { weightsRepo, mealsRepo, foodsRepo } = await import('@/services/repositories');
    await ensureSeeded();
    await foodsRepo.put(KCAL_FOOD);
    // Poids stable à 83,5 kg, apport 2450 → maintenance mesurée 2450.
    for (const e of weights(14, 83.5, 0)) await weightsRepo.put(e);
    for (const e of meals(14, 2450)) await mealsRepo.put(e);

    const { useProfileStore } = await import('@/store/profileStore');
    const { useFoodsStore } = await import('@/store/foodsStore');
    const { useWeightStore } = await import('@/store/weightStore');
    await useFoodsStore.getState().load();
    await useWeightStore.getState().load();
    await useProfileStore.getState().load();

    // Phase 1 : en sèche (déficit 400), objectif 84 kg PAS encore défini → cible ~2050.
    await useProfileStore.getState().recalcTargetsFromWeight();
    expect(useProfileStore.getState().profile!.targetKcal).toBeLessThan(2150);

    // On définit un objectif DÉJÀ atteint (83,5 ≤ 84) → la prochaine pesée bascule.
    const ps = useProfileStore.getState();
    await ps.saveProfile({ ...ps.profile!, goalWeightKg: 84 });
    await useProfileStore.getState().recalcTargetsFromWeight();

    const s = useProfileStore.getState().settings!;
    const p = useProfileStore.getState().profile!;
    expect(s.deficitKcal).toBe(0);
    expect(s.goalReachedAt).toBeDefined();
    expect(p.targetKcal).toBeGreaterThanOrEqual(2420); // maintenance, plus de déficit
  });

  it('ne bascule pas tant que le poids cible n’est pas atteint', async () => {
    const { ensureSeeded } = await import('@/services/seed');
    const { weightsRepo, mealsRepo, foodsRepo } = await import('@/services/repositories');
    await ensureSeeded();
    await foodsRepo.put(KCAL_FOOD);
    for (const e of weights(14, 85, 0)) await weightsRepo.put(e); // encore à 85
    for (const e of meals(14, 2450)) await mealsRepo.put(e);
    const { useProfileStore } = await import('@/store/profileStore');
    const { useFoodsStore } = await import('@/store/foodsStore');
    const { useWeightStore } = await import('@/store/weightStore');
    await useFoodsStore.getState().load();
    await useWeightStore.getState().load();
    await useProfileStore.getState().load();
    const ps = useProfileStore.getState();
    await ps.saveProfile({ ...ps.profile!, goalWeightKg: 80 }); // objectif 80, on est à 85
    await useProfileStore.getState().recalcTargetsFromWeight();
    const s = useProfileStore.getState().settings!;
    expect(s.deficitKcal ?? 400).toBe(400);
    expect(s.goalReachedAt).toBeUndefined();
  });
});

describe('masse grasse : synchro pesée → profil', () => {
  async function boot() {
    const { ensureSeeded } = await import('@/services/seed');
    const { foodsRepo } = await import('@/services/repositories');
    await ensureSeeded();
    await foodsRepo.put(KCAL_FOOD);
    const { useProfileStore } = await import('@/store/profileStore');
    const { useFoodsStore } = await import('@/store/foodsStore');
    const { useWeightStore } = await import('@/store/weightStore');
    await useFoodsStore.getState().load();
    await useWeightStore.getState().load();
    await useProfileStore.getState().load();
    return { useProfileStore, useWeightStore };
  }

  it('logger le %MG met à jour profile.bodyFatPct (calibre BMR/protéines)', async () => {
    const { useProfileStore, useWeightStore } = await boot();
    await useWeightStore.getState().upsertWeight(dayKey(new Date()), 84.5, 18.2);
    expect(useProfileStore.getState().profile!.bodyFatPct).toBeCloseTo(18.2, 5);
    expect(useProfileStore.getState().profile!.weightKg).toBeCloseTo(84.5, 5);
  });

  it('une pesée SANS %MG (voyage) n’écrase pas la dernière MG connue', async () => {
    const { useProfileStore, useWeightStore } = await boot();
    await useWeightStore.getState().upsertWeight(dayKey(subDays(new Date(), 1)), 84.8, 18.5);
    // Lendemain : poids seul (pas de balance complète).
    await useWeightStore.getState().upsertWeight(dayKey(new Date()), 84.6);
    expect(useProfileStore.getState().profile!.bodyFatPct).toBeCloseTo(18.5, 5);
    expect(useProfileStore.getState().profile!.weightKg).toBeCloseTo(84.6, 5);
  });

  it('éditer une pesée sans repasser le %MG conserve la valeur du jour', async () => {
    const { useWeightStore } = await boot();
    const today = dayKey(new Date());
    await useWeightStore.getState().upsertWeight(today, 84.0, 17.9);
    await useWeightStore.getState().upsertWeight(today, 84.2); // correction du poids seul
    const entry = useWeightStore.getState().weights.find((w) => w.date === today)!;
    expect(entry.kg).toBeCloseTo(84.2, 5);
    expect(entry.bodyFatPct).toBeCloseTo(17.9, 5);
  });
});

describe('anti-cumul hebdomadaire (trend-nudge)', () => {
  it('la correction ±150 ne se cumule pas si rappelée dans la semaine', async () => {
    const { ensureSeeded } = await import('@/services/seed');
    const { weightsRepo } = await import('@/services/repositories');
    await ensureSeeded();
    // Perte trop lente, AUCUN repas loggé → on est en mode anti-stagnation.
    for (const e of weights(21, 85, 0.05)) await weightsRepo.put(e);
    const { useProfileStore } = await import('@/store/profileStore');
    const { useFoodsStore } = await import('@/store/foodsStore');
    const { useWeightStore } = await import('@/store/weightStore');
    await useFoodsStore.getState().load();
    await useWeightStore.getState().load();
    await useProfileStore.getState().load();

    await useProfileStore.getState().recalcTargetsFromWeight();
    const off1 = useProfileStore.getState().settings!.trendAdjustKcal;
    expect(off1).toBe(-150); // 1re correction appliquée

    await useProfileStore.getState().recalcTargetsFromWeight();
    const off2 = useProfileStore.getState().settings!.trendAdjustKcal;
    expect(off2).toBe(-150); // PAS -300 : garde hebdo
  });
});
