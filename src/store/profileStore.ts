import { create } from 'zustand';
import type { GoalMode, Profile, PlanTemplateMeal, Meal, FoodTag, MealSlot } from '@/types';
import { profileRepo, settingsRepo } from '@/services/repositories';
import type { FullSettings } from '@/services/repositories/settingsRepo';
import type { Food } from '@/types';
import { computeMacrosFromGrams, proteinTargetG, fatTargetG, muscleSafeFloorKcal, bmr, tdee } from '@/lib/nutrition';
import { computeAdaptiveTarget, estimateMaintenance, refeedGuidance, MAINTENANCE_WINDOW_DAYS } from '@/lib/coach';
import { smoothedCurrentKg, smoothedBodyFatPct } from '@/lib/trend';
import { getTemplateForDate } from '@/lib/templates';
import { addDays, dayKey, todayKey } from '@/lib/dates';
import { MAX_CARRY_DAYS } from '@/lib/estimateRebalance';
import { SEED_WEEKLY_ROTATION, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { substituteRotationToAllowed } from '@/lib/foodSelection';
import { usableFoodIds, isExcluded } from '@/lib/diet';
import { applyFoodSwaps, swapInDayPlan } from '@/lib/swap';
import { applyMealStructure } from '@/lib/mealStructure';
import { injectAddonFoods } from '@/lib/addons';
import { buildTrainingDayPlan } from '@/lib/trainingDay';

/**
 * Construit le plan hebdo appliqué : rotation curée → substitution des aliments non
 * autorisés par la sélection (même rôle) → scaling « protéines-fixes » sur les cibles.
 * `selectedFoodIds` absent → aucune substitution (rotation intacte).
 */
function buildScaledPlan(
  settings: FullSettings,
  foods: Food[],
  byId: (id: string) => Food | undefined,
  kcal: number,
  protein: number,
  fat: number
): Record<string, PlanTemplateMeal[]> {
  // Exclusions strictes appliquées AVANT toute substitution : un aliment interdit ne doit
  // jamais pouvoir rentrer par la porte de derrière.
  const allowed = usableFoodIds(settings.selectedFoodIds, settings.excludedTags, foods);
  const rotation = substituteRotationToAllowed(
    SEED_WEEKLY_ROTATION, allowed, byId,
    (f) => isExcluded(f, settings.excludedTags)
  );
  // Remplacements durables APRÈS la substitution : un choix explicite de l'utilisateur
  // prime sur celui du moteur.
  const swapped = applyFoodSwaps(rotation, settings.foodSwaps, byId);
  // Ingrédients d'appoint disponibles injectés APRÈS la substitution (jamais remplacés par
  // un autre du même rôle) mais AVANT le scaling, pour qu'ils entrent dans le budget
  // calorique et que le plan se re-échelonne autour d'eux.
  const withAddons = injectAddonFoods(
    swapped, settings.addonFoods,
    (id) => isExcluded(byId(id), settings.excludedTags)
  );
  // `byId` (et pas la base seed figée) : le plan peut contenir des aliments créés par
  // l'utilisateur, ou des aliments du seed dont il a corrigé les macros.
  const scaled = scaleRotationToTargets(withAddons, kcal, protein, fat, byId);
  // Structure des repas EN DERNIER : elle ne fait que déplacer des aliments d'un repas à
  // l'autre, donc elle ne peut pas dérégler des cibles déjà atteintes.
  return applyMealStructure(scaled, settings.activeSlots);
}

/**
 * Une journée est « entamée » dès qu'au moins un aliment DU PLAN a été coché ce jour-là.
 * C'est le seul cas où réécrire le plan du jour poserait problème (des aliments déjà
 * validés se « dé-valideraient »). Tant que rien n'est coché, on peut recalculer le
 * menu du jour en direct.
 */
function isTodayStarted(meals: Meal[]): boolean {
  const today = todayKey();
  return meals.some((m) => m.date === today && m.items.some((it) => it.fromTemplate));
}

/**
 * Fige le plan du JOUR avant qu'un ré-ajustement (nouvelle sélection d'aliments, nouvelle
 * cible…) ne réécrive les templates hebdo — MAIS uniquement si la journée est déjà entamée
 * (`started`). Sinon on NE fige PAS : la modification s'applique IMMÉDIATEMENT au menu du
 * jour (au lieu d'attendre demain). Ainsi, changer ses aliments un jour où l'on n'a encore
 * rien coché met le plan à jour tout de suite ; si on a déjà validé des aliments, on protège
 * la journée en cours (le changement prend effet demain). Préserve la valeur du matin si un
 * snapshot existait déjà, et ne conserve jamais de snapshot de jour passé.
 * `settings` doit être l'état AVANT rescale.
 *
 * Un snapshot du jour DÉJÀ présent est toujours conservé, même si la journée n'est pas
 * entamée : il ne peut venir que d'un gel du matin ou d'un remplacement ponctuel décidé
 * par l'utilisateur, et un re-calibrage automatique n'a pas à effacer ce choix.
 */
function freezeTodayPlan(settings: FullSettings, started: boolean): Record<string, PlanTemplateMeal[]> {
  const today = todayKey();
  const next: Record<string, PlanTemplateMeal[]> = {};
  // Conserve d'éventuels snapshots FUTURS ; on ne garde jamais le passé.
  for (const [date, plan] of Object.entries(settings.planSnapshots ?? {})) {
    if (date > today) next[date] = plan;
  }
  const existing = settings.planSnapshots?.[today];
  if (existing) next[today] = existing;
  else if (started) next[today] = getTemplateForDate(today, settings);
  return next;
}

interface ProfileState {
  profile: Profile | null;
  settings: FullSettings | null;
  loaded: boolean;
  load: () => Promise<void>;
  saveProfile: (p: Profile) => Promise<void>;
  saveSettings: (s: FullSettings) => Promise<void>;
  savePlanTemplate: (tpl: PlanTemplateMeal[]) => Promise<void>;
  /** Sauvegarde un plan spécifique pour un jour de la semaine ISO (1=lundi..7=dimanche). */
  saveWeekdayTemplate: (weekday: number, tpl: PlanTemplateMeal[]) => Promise<void>;
  /** Supprime le plan spécifique d'un jour (retour au plan commun). */
  clearWeekdayTemplate: (weekday: number) => Promise<void>;
  /** Remplace les 7 plans hebdo (utilisé pour charger la rotation pré-conçue). */
  saveAllWeeklyTemplates: (rotation: Record<string, PlanTemplateMeal[]>) => Promise<void>;
  /**
   * Met à jour le stock garde-manger d'un aliment (grammes d'achat).
   * `grams <= 0` retire l'entrée (plus de stock déclaré).
   */
  setPantryStock: (foodId: string, grams: number) => Promise<void>;
  /**
   * Recalcule et APPLIQUE la cible calorique du jour à partir des recommandations
   * du coach (maintenance mesurée, ou correction anti-stagnation ±150), puis
   * re-scale le plan. Appelé automatiquement après une pesée si `adaptiveTargets`
   * est actif → l'utilisateur n'a qu'à suivre le chiffre affiché.
   */
  recalcTargetsFromWeight: () => Promise<void>;
  /**
   * Fixe une cible calorique explicite (ex. issue de la maintenance mesurée par le
   * coach), recalcule les macros et re-scale le plan en protéines-fixes.
   */
  applyTargetKcal: (kcal: number) => Promise<void>;
  /**
   * Met à jour la liste des aliments autorisés et RECONSTRUIT le plan (substitution par
   * rôle + scaling), sur les cibles courantes. Le changement s'applique dès demain
   * (journée en cours figée).
   */
  setSelectedFoods: (ids: string[]) => Promise<void>;
  /**
   * Reconstruit le plan à sélection INCHANGÉE (ex. après édition des macros d'un aliment,
   * ou ajout/suppression d'un aliment) pour que les portions reflètent les nouvelles valeurs.
   */
  rebuildPlan: () => Promise<void>;
  /**
   * Remplacement DURABLE d'un aliment par un autre dans toute la rotation. Le remplaçant
   * entre aussi dans la sélection : le vouloir au menu, c'est l'accepter dans sa diète.
   */
  setFoodSwap: (fromFoodId: string, toFoodId: string) => Promise<void>;
  /** Annule un remplacement durable (retour à l'aliment d'origine). */
  clearFoodSwap: (fromFoodId: string) => Promise<void>;
  /** Choisit les repas de la journée (les repas retirés sont reversés, pas supprimés). */
  setActiveSlots: (slots: MealSlot[]) => Promise<void>;
  /**
   * Bascule la disponibilité d'un ingrédient d'appoint (« j'en ai / j'en ai pas ») et
   * reconstruit le plan : disponible → injecté et le plan se re-échelonne autour de lui ;
   * indisponible → retiré, les autres aliments absorbent ses calories. Cf. lib/addons.
   * `addonId` = clé stable de l'appoint (pas l'aliment, qui change avec le parfum).
   */
  setAddonAvailable: (addonId: string, available: boolean) => Promise<void>;
  /**
   * Choisit la VARIANTE active d'un ingrédient d'appoint (parfum, marque) et reconstruit le
   * plan. Sans effet si la variante n'est pas déclarée pour cet appoint.
   */
  setAddonVariant: (addonId: string, foodId: string) => Promise<void>;
  /**
   * Reprend une sèche au rythme donné (%/sem) après une phase de récupération : repose une
   * date de sèche fraîche, efface le marqueur de récupération, réactive l'adaptatif et
   * recalcule. Utilisé par le rappel « récup faite » (RecoveryCard).
   */
  resumeCut: (ratePctPerWeek: number) => Promise<void>;
  /**
   * Active / lève la pause diète (vacances). En pause : cible tenue à la maintenance,
   * recalcul auto suspendu. À la reprise : la cible du mode/rythme configuré est rétablie.
   */
  setDietPaused: (paused: boolean) => Promise<void>;
  /**
   * Pose les exclusions strictes (profil alimentaire, allergies) et reconstruit le plan.
   * Les remplacements durables qui pointaient vers un aliment devenu interdit sont
   * supprimés : les garder ferait rentrer l'aliment exclu par la porte de derrière.
   */
  setExcludedTags: (tags: FoodTag[]) => Promise<void>;
  /**
   * Remplacement PONCTUEL, pour une seule date : écrit le plan figé de ce jour sans
   * toucher à la rotation. Le lendemain, le menu d'origine revient.
   */
  swapForDay: (dateKey: string, slot: PlanTemplateMeal['slot'], fromFoodId: string, to: Food) => Promise<void>;
  /**
   * Applique un JOUR DE RECHARGE (refeed) à AUJOURD'HUI en un tap : re-scale le plan du jour
   * à la maintenance (protéines inchangées, lipides bas, glucides ↑) et le fige en snapshot
   * du jour. Se reverte tout seul demain. No-op si un refeed n'est pas recommandé (hors
   * sèche, %MG trop haut). Cf. [[zero-manual-steps]].
   */
  applyRefeedToday: () => Promise<void>;
  /** Annule le refeed du jour : retire le snapshot du jour et le marqueur (retour au plan de sèche). */
  clearRefeedToday: () => Promise<void>;
  /**
   * Déclare une SÉANCE aujourd'hui : la collation devient le bloc pré-training (galettes,
   * miel, banane) et le reste du jour se re-échelonne autour. Vaut pour aujourd'hui seulement.
   * Cf. lib/trainingDay.
   */
  applyTrainingToday: () => Promise<void>;
  /** Annule la séance du jour : restaure le plan du jour d'avant la séance. */
  clearTrainingToday: () => Promise<void>;
  /**
   * Mémorise le surplus non compensable d'un jour avec repas estimé (0 = l'efface), reporté
   * sur les jours suivants. Purge les dates sorties de la fenêtre de report.
   */
  setEstimateSurplus: (date: string, kcal: number) => Promise<void>;
}

/** Snapshots sans les dates passées (même règle de purge partout). */
function futureSnapshots(settings: FullSettings, today: string): Record<string, PlanTemplateMeal[]> {
  const out: Record<string, PlanTemplateMeal[]> = {};
  for (const [date, plan] of Object.entries(settings.planSnapshots ?? {})) {
    if (date >= today) out[date] = plan;
  }
  return out;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  settings: null,
  loaded: false,
  async load() {
    const [profile, settings] = await Promise.all([profileRepo.get(), settingsRepo.get()]);
    set({ profile: profile ?? null, settings: settings ?? null, loaded: true });
  },
  async saveProfile(p) {
    await profileRepo.put(p);
    set({ profile: { ...p, updatedAt: Date.now() } });
  },
  async saveSettings(s) {
    await settingsRepo.put(s);
    set({ settings: s });
  },
  async savePlanTemplate(tpl) {
    const s = get().settings;
    if (!s) return;
    const next = { ...s, planTemplate: tpl };
    await settingsRepo.put(next);
    set({ settings: next });
  },

  async saveWeekdayTemplate(weekday, tpl) {
    const s = get().settings;
    if (!s) return;
    const next: FullSettings = {
      ...s,
      weeklyTemplates: { ...s.weeklyTemplates, [String(weekday)]: tpl }
    };
    await settingsRepo.put(next);
    set({ settings: next });
  },

  async clearWeekdayTemplate(weekday) {
    const s = get().settings;
    if (!s) return;
    const { [String(weekday)]: _removed, ...rest } = s.weeklyTemplates ?? {};
    void _removed;
    const next: FullSettings = { ...s, weeklyTemplates: rest };
    await settingsRepo.put(next);
    set({ settings: next });
  },

  async saveAllWeeklyTemplates(rotation) {
    const s = get().settings;
    if (!s) return;
    const next: FullSettings = { ...s, weeklyTemplates: { ...rotation } };
    await settingsRepo.put(next);
    set({ settings: next });
  },

  async setPantryStock(foodId, grams) {
    const s = get().settings;
    if (!s) return;
    const pantry = { ...(s.pantry ?? {}) };
    if (grams > 0) pantry[foodId] = Math.round(grams);
    else delete pantry[foodId];
    const next: FullSettings = { ...s, pantry };
    await settingsRepo.put(next);
    set({ settings: next });
  },

  async recalcTargetsFromWeight() {
    const { profile, settings } = get();
    if (!profile || !settings) return;
    // Pause diète : la cible est tenue à la maintenance et NE bouge pas sur une pesée.
    // C'est tout l'intérêt du mode (vacances, données peu fiables) : entrer un poids ne
    // doit pas relancer le déficit ni faire sauter les calories du jour.
    if (settings.dietPaused) return;

    // Phase de RÉCUPÉRATION (maintien post-sèche) : on vise la maintenance THÉORIQUE
    // (formule BMR × activité sur le poids courant), PAS la maintenance mesurée. La mesurée
    // est contaminée par la sèche trop dure qu'on quitte (souvent ressortie près du BMR) :
    // s'y caler ferait « récupérer » à son ancien apport de famine, ce qui n'aurait aucun
    // effet. On mange à sa vraie maintenance estimée pour restaurer le métabolisme, et les
    // logs honnêtes de ces 2-3 semaines recaleront la mesurée vers le haut.
    if (settings.recoveryStartedAt != null) {
      await get().applyTargetKcal(Math.round(tdee(profile)));
      return;
    }

    // Signaux du coach : logs alimentaires (toutes dates) + pesées.
    // Imports dynamiques pour éviter un cycle de modules au chargement.
    const [{ useFoodsStore }, { useWeightStore }, { mealsRepo }] = await Promise.all([
      import('./foodsStore'),
      import('./weightStore'),
      import('@/services/repositories')
    ]);
    const byId = useFoodsStore.getState().byId;
    const weights = useWeightStore.getState().weights;
    const meals = await mealsRepo.all();
    const offset = settings.trendAdjustKcal ?? 0;

    const smoothed = smoothedCurrentKg(weights);

    // %MG LISSÉ pour le coach : la lecture d'impédance brute la plus récente est trop bruitée
    // pour piloter les garde-fous (BMR Katch, fourchette de rythme, plafond de déficit, cible
    // protéique). On calcule les cibles sur un %MG moyenné 7 j. Le profil PERSISTÉ garde, lui,
    // le %MG brut (dernière mesure, source de vérité de la balance) — on ne lisse que le calcul.
    const bfSmoothed = profile.bodyFatPct != null ? smoothedBodyFatPct(weights) : null;
    const coachProfile: Profile =
      bfSmoothed != null ? { ...profile, bodyFatPct: bfSmoothed } : profile;

    // Direction : mode explicite si présent, sinon inféré (rétro-compat) du signe du
    // rythme/déficit legacy — déficit ou rythme de perte > 0 → sèche, déficit < 0 →
    // prise de masse, sinon maintien.
    const mode: GoalMode =
      settings.goalMode ??
      (((settings.lossRatePctPerWeek ?? 0) > 0 || (settings.deficitKcal ?? 0) > 0)
        ? 'cut'
        : (settings.deficitKcal ?? 0) < 0
        ? 'bulk'
        : 'maintain');

    // Déficit EFFECTIF, SIGNÉ (positif = déficit / sèche, négatif = surplus / prise). Si
    // un rythme %/sem est configuré (approche science du sport), il est la source de
    // vérité : le déficit kcal en est dérivé sur le poids LISSÉ courant
    // (`déficit = ±rate% × poids × 7700 / 7`) → il se recalibre tout seul à mesure que
    // le poids bouge. En sèche sans rythme, mode legacy piloté par `deficitKcal`.
    const weightForRate = smoothed ?? profile.weightKg;
    const kcalFromRate = (pct: number) => Math.round((pct / 100) * weightForRate * 7700 / 7);
    const deficitRaw =
      mode === 'cut'
        ? (settings.lossRatePctPerWeek != null ? kcalFromRate(settings.lossRatePctPerWeek) : (settings.deficitKcal ?? 400))
        : mode === 'bulk'
        ? -kcalFromRate(settings.gainRatePctPerWeek ?? 0.25)
        : 0;
    // Un rythme %/sem pilote le déficit (à rafraîchir dans le cache `deficitKcal`) :
    // toujours en prise de masse, et en sèche dès qu'un rythme est défini.
    const rateDriven = mode === 'bulk' || (mode === 'cut' && settings.lossRatePctPerWeek != null);

    // Bascule AUTO en maintien quand l'objectif de poids est atteint (sur le poids
    // LISSÉ, pas une pesée isolée). En sèche : poids ≤ objectif ; en prise : poids ≥
    // objectif. Une seule fois : ensuite déficit 0 (+ rythmes 0) persisté → plus de
    // re-bascule.
    const goalReached =
      profile.goalWeightKg != null && smoothed != null &&
      ((mode === 'cut' && deficitRaw > 0 && smoothed <= profile.goalWeightKg + 0.1) ||
       (mode === 'bulk' && deficitRaw < 0 && smoothed >= profile.goalWeightKg - 0.1));
    const deficit = goalReached ? 0 : deficitRaw;
    const effectiveMode: GoalMode = goalReached ? 'maintain' : mode;
    // 1re atteinte de l'objectif : on persistera la bascule même si la cible bouge peu.
    const firstReach = goalReached && settings.goalReachedAt == null;

    const reco = computeAdaptiveTarget(
      coachProfile, deficit, offset, meals, byId, weights,
      settings.measuredActivityFactor, settings.slowdownGuardEnabled ?? true, effectiveMode,
      settings.allowBelowBmr ?? false
    );

    // Garde anti-emballement : une correction de TENDANCE (±150, relative) ne
    // s'applique qu'une fois tous les 7 jours, sinon elle se cumulerait à chaque
    // pesée. La maintenance MESURÉE (absolue) n'est pas concernée : elle converge.
    const now = Date.now();
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const guardActive = reco.source === 'trend-nudge' && now - (settings.lastAutoAdjustAt ?? 0) < WEEK_MS;

    // Cible visée : si la correction tendance est en veille (garde hebdo), on
    // garde la cible = formule + offset DÉJÀ acquis (sans le nouvel incrément).
    // Re-clampe au plancher de sécurité : retirer le nudge pourrait repasser dessous.
    // Réutilise le plancher CHOISI par le coach (préservation musculaire en sèche, sinon
    // BMR/absolu). Recalculer un minSafeKcal ici raterait le plancher anti-fonte musculaire
    // et pourrait laisser la cible repasser près du BMR.
    const newKcal = Math.max(reco.floorKcal, guardActive ? reco.targetKcal - reco.nudgeKcal : reco.targetKcal);

    // Protéines calées sur la MASSE MAIGRE et relevées avec le déficit (préservation
    // musculaire) ; lipides sur le poids ; glucides = reste des calories. Calculées
    // AVANT la garde anti-bruit : le %MG (masse maigre) peut faire bouger les protéines
    // même quand les calories, elles, ne bougent pas (ex. maintenance mesurée stable).
    const macros = computeMacrosFromGrams(newKcal, proteinTargetG(coachProfile, deficit), fatTargetG(coachProfile, newKcal));

    // Évite de réécrire profil + plan pour du bruit : on ne s'arrête que si NI les
    // calories (<25 kcal) NI les protéines (<3 g) NI les lipides (<3 g) n'ont bougé
    // notablement — sauf à la 1re atteinte de l'objectif, où l'on doit persister la
    // bascule en maintien. Les lipides comptent aussi : un changement de réglage
    // (g/kg) doit atteindre le plan même quand calories et protéines sont stables.
    const kcalStable = profile.targetKcal != null && Math.abs(newKcal - profile.targetKcal) < 25;
    const proteinStable = profile.targetProteinG != null && Math.abs(macros.protein - profile.targetProteinG) < 3;
    const fatStable = profile.targetFatG != null && Math.abs(macros.fat - profile.targetFatG) < 3;
    if (!firstReach && kcalStable && proteinStable && fatStable) return;
    const updated: Profile = {
      ...profile,
      targetKcal: newKcal,
      targetProteinG: macros.protein,
      targetFatG: macros.fat,
      targetCarbsG: macros.carbs,
      updatedAt: now
    };
    await profileRepo.put(updated);

    // Re-calibre le plan en "protéines-fixes" : les protéines sont calées sur la
    // cible, seuls glucides/lipides flexent pour atteindre les calories.
    // → en sèche plus forte, les protéines restent hautes (ce qu'on veut).
    // La substitution respecte les aliments sélectionnés (settings.selectedFoodIds).
    const scaled = buildScaledPlan(settings, useFoodsStore.getState().foods, byId, newKcal, macros.protein, macros.fat);
    // On ne PERSISTE le nouvel offset (et la date) que si la correction est réellement
    // appliquée maintenant (déclenchée et hors garde hebdo).
    const applyNudge = reco.source === 'trend-nudge' && !guardActive;
    // Calibre le facteur d'activité réel dès qu'une maintenance a été MESURÉE
    // (= reco.maintenanceKcal). Repli personnalisé pour les futurs jours sans logs.
    const measuredFactor = reco.maintenanceKcal != null
      ? Math.max(1.2, Math.min(2.2, reco.maintenanceKcal / bmr(coachProfile)))
      : null;
    // Calibre le facteur d'activité UNIQUEMENT sur une maintenance mesurée crédible. Si la
    // mesure est aberrante (sous-loggage), on EFFACE un éventuel facteur déjà pollué vers le
    // bas → repli sur le niveau d'activité déclaré, ce qui casse la spirale cible-au-BMR.
    const calibrate = measuredFactor != null
      ? { measuredActivityFactor: measuredFactor }
      : reco.measuredImplausible
        ? { measuredActivityFactor: undefined }
        : {};
    // Fige le plan d'aujourd'hui (valeurs courantes) AVANT d'appliquer le rescale, mais
    // uniquement si la journée est déjà entamée : sinon la nouvelle cible s'applique tout
    // de suite. `meals` est déjà chargé plus haut (signaux du coach).
    const planSnapshots = freezeTodayPlan(settings, isTodayStarted(meals));
    // Bascule en maintien : persiste déficit 0 + l'horodate (bilan hebdo + toast
    // l'annoncent). Si déjà basculé (goalReachedAt présent), on ne ré-écrit pas.
    // Suivi de la durée de sèche / prise continue (déclencheurs "diet break" et
    // "mini-cut"). On pose la date de début dès que le déficit/surplus est actif et
    // qu'elle manque (backfill d'une phase déjà en cours), et on l'efface au passage en
    // maintien (ou dans l'autre direction) / à l'atteinte de l'objectif.
    const cutStartPatch =
      deficit > 0
        ? {
            ...(settings.cutStartedAt == null ? { cutStartedAt: now } : {}),
            // Gèle le facteur d'activité de RÉFÉRENCE au 1er relevé mesuré de la sèche
            // (référentiel du détecteur d'adaptation métabolique, cf. cutBaselineFactor).
            // Une seule fois : une fois posé, il ne bouge plus jusqu'à la fin de la sèche.
            ...(settings.cutBaselineFactor == null && measuredFactor != null
              ? { cutBaselineFactor: measuredFactor }
              : {})
          }
        : { cutStartedAt: undefined, cutBaselineFactor: undefined };
    const bulkStartPatch =
      deficit < 0
        ? (settings.bulkStartedAt == null ? { bulkStartedAt: now } : {})
        : { bulkStartedAt: undefined };

    const nextSettings: FullSettings = {
      ...settings,
      weeklyTemplates: scaled,
      planSnapshots,
      ...calibrate,
      ...cutStartPatch,
      ...bulkStartPatch,
      // Rafraîchit le cache `deficitKcal` (signé) avec le déficit/surplus dérivé du
      // rythme %/sem sur le poids courant (garde CoachCard / bilan hebdo cohérents à
      // mesure que le poids bouge). Hors bascule maintien, qui force 0 + rythmes 0.
      ...(rateDriven && !goalReached ? { deficitKcal: deficitRaw } : {}),
      ...(goalReached
        ? { goalMode: 'maintain' as GoalMode, deficitKcal: 0, lossRatePctPerWeek: 0, gainRatePctPerWeek: 0, goalReachedAt: settings.goalReachedAt ?? now, recoveryStartedAt: undefined }
        : {}),
      ...(applyNudge ? { trendAdjustKcal: reco.trendAdjustKcal, lastAutoAdjustAt: now } : {})
    };
    await settingsRepo.put(nextSettings);
    set({ profile: updated, settings: nextSettings });

    if (firstReach) {
      try {
        const { useUIStore } = await import('./uiStore');
        useUIStore.getState().toast('🎯 Objectif de poids atteint : cible passée en maintien.', 'success');
      } catch { /* toast best-effort */ }
    }
  },

  async applyTargetKcal(kcal) {
    const { profile, settings } = get();
    if (!profile || !settings) return;
    // Plancher de préservation musculaire (formule TDEE comme maintenance de référence) :
    // même garde-fou anti-fonte musculaire que la cible adaptative.
    const floor = muscleSafeFloorKcal(profile, Math.round(tdee(profile)), { allowBelowBmr: settings.allowBelowBmr ?? false });
    const targetKcal = Math.max(floor, Math.round(kcal));
    // Déficit implicite (maintenance − cible) pour calibrer les protéines sur la
    // masse maigre, comme dans recalcTargetsFromWeight.
    const impliedDeficit = Math.max(0, Math.round(tdee(profile)) - targetKcal);
    const macros = computeMacrosFromGrams(targetKcal, proteinTargetG(profile, impliedDeficit), fatTargetG(profile, targetKcal));
    const updated: Profile = {
      ...profile,
      targetKcal,
      targetProteinG: macros.protein,
      targetFatG: macros.fat,
      targetCarbsG: macros.carbs,
      updatedAt: Date.now()
    };
    await profileRepo.put(updated);

    const [{ useFoodsStore }, { mealsRepo }] = await Promise.all([
      import('./foodsStore'),
      import('@/services/repositories')
    ]);
    const fs = useFoodsStore.getState();
    const scaled = buildScaledPlan(settings, fs.foods, fs.byId, targetKcal, macros.protein, macros.fat);
    // Idem : on ne fige la journée en cours que si elle est déjà entamée (sinon la
    // nouvelle cible s'applique immédiatement au menu du jour).
    const planSnapshots = freezeTodayPlan(settings, isTodayStarted(await mealsRepo.all()));
    const nextSettings: FullSettings = { ...settings, weeklyTemplates: scaled, planSnapshots };
    await settingsRepo.put(nextSettings);
    set({ profile: updated, settings: nextSettings });
  },

  async setSelectedFoods(ids) {
    const { settings } = get();
    if (!settings) return;
    await get().saveSettings({ ...settings, selectedFoodIds: ids });
    await get().rebuildPlan();
  },

  async rebuildPlan() {
    const { profile, settings } = get();
    if (!profile || !settings) return;
    const [{ useFoodsStore }, { mealsRepo }] = await Promise.all([
      import('./foodsStore'),
      import('@/services/repositories')
    ]);
    const fs = useFoodsStore.getState();
    // Cibles courantes : le plan se rebâtit sur les mêmes calories/macros, avec les
    // aliments autorisés et leurs macros À JOUR. Rebuild INCONDITIONNEL (pas de garde
    // anti-bruit) : sélection / macros ont pu changer sans que les cibles bougent.
    const kcal = profile.targetKcal ?? Math.round(tdee(profile));
    const protein = profile.targetProteinG ?? proteinTargetG(profile);
    const fat = profile.targetFatG ?? fatTargetG(profile, kcal);
    const scaled = buildScaledPlan(settings, fs.foods, fs.byId, kcal, protein, fat);
    // On ne fige la journée en cours que si elle est entamée : sinon le changement de
    // sélection s'applique tout de suite au menu du jour (au lieu d'attendre demain).
    const planSnapshots = freezeTodayPlan(settings, isTodayStarted(await mealsRepo.all()));
    const next: FullSettings = { ...settings, weeklyTemplates: scaled, planSnapshots };
    await settingsRepo.put(next);
    set({ settings: next });
  },

  async setFoodSwap(fromFoodId, toFoodId) {
    const { settings } = get();
    if (!settings || fromFoodId === toFoodId) return;
    const foodSwaps = { ...(settings.foodSwaps ?? {}), [fromFoodId]: toFoodId };
    // Chaîne de remplacements : si l'origine était elle-même la cible d'un autre
    // remplacement (A→B puis B→C), on redirige vers la cible finale au lieu d'empiler.
    for (const [k, v] of Object.entries(foodSwaps)) {
      if (v === fromFoodId) foodSwaps[k] = toFoodId;
    }
    const sel = settings.selectedFoodIds;
    const selectedFoodIds = sel && !sel.includes(toFoodId) ? [...sel, toFoodId] : sel;
    await get().saveSettings({ ...settings, foodSwaps, selectedFoodIds });
    await get().rebuildPlan();
  },

  async setActiveSlots(slots) {
    const { settings } = get();
    if (!settings) return;
    await get().saveSettings({ ...settings, activeSlots: slots });
    await get().rebuildPlan();
  },

  async setAddonAvailable(addonId, available) {
    const { settings } = get();
    if (!settings?.addonFoods) return;
    const addonFoods = settings.addonFoods.map((a) =>
      a.id === addonId ? { ...a, available } : a
    );
    await get().saveSettings({ ...settings, addonFoods });
    await get().rebuildPlan();
  },

  async setAddonVariant(addonId, foodId) {
    const { settings } = get();
    if (!settings?.addonFoods) return;
    const target = settings.addonFoods.find((a) => a.id === addonId);
    // Garde : on n'active qu'une variante DÉCLARÉE (sinon on injecterait un aliment
    // arbitraire dans le plan), et on évite un rebuild inutile si rien ne change.
    if (!target || target.foodId === foodId) return;
    if (!target.variants?.some((v) => v.foodId === foodId)) return;
    const addonFoods = settings.addonFoods.map((a) =>
      a.id === addonId ? { ...a, foodId } : a
    );
    await get().saveSettings({ ...settings, addonFoods });
    await get().rebuildPlan();
  },

  async resumeCut(ratePctPerWeek) {
    const { profile, settings } = get();
    if (!profile || !settings) return;
    const now = Date.now();
    // Déficit dérivé du rythme sur le poids courant (7700 kcal / kg), comme MacroTargetsForm.
    const deficit = Math.round((ratePctPerWeek / 100) * profile.weightKg * 7700 / 7);
    await get().saveSettings({
      ...settings,
      adaptiveTargets: true,
      goalMode: 'cut',
      lossRatePctPerWeek: ratePctPerWeek,
      deficitKcal: deficit,
      // Nouvelle sèche : la récup a rompu la continuité, on repart d'une date fraîche et
      // d'un facteur de référence vierge (il se re-gèlera au 1er relevé de cette sèche).
      cutStartedAt: now,
      cutBaselineFactor: undefined,
      bulkStartedAt: undefined,
      recoveryStartedAt: undefined,
      // Une reprise de sèche lève une éventuelle pause en cours.
      dietPaused: false
    });
    await get().recalcTargetsFromWeight();
  },

  async setDietPaused(paused) {
    const { profile, settings } = get();
    if (!profile || !settings) return;
    await get().saveSettings({ ...settings, dietPaused: paused });
    if (paused) {
      // Tient la cible à la maintenance : mesurée si dispo (plus juste), sinon formule.
      const [{ useFoodsStore }, { useWeightStore }, { mealsRepo }] = await Promise.all([
        import('./foodsStore'),
        import('./weightStore'),
        import('@/services/repositories')
      ]);
      const est = estimateMaintenance(await mealsRepo.all(), useFoodsStore.getState().byId, useWeightStore.getState().weights, MAINTENANCE_WINDOW_DAYS);
      const maintenance = est.ok ? est.tdee : Math.round(tdee(profile));
      await get().applyTargetKcal(maintenance);
    } else {
      // Reprise : on rétablit la cible pilotée par le mode/rythme (déficit à nouveau actif).
      await get().recalcTargetsFromWeight();
    }
  },

  async setExcludedTags(tags) {
    const { settings } = get();
    if (!settings) return;
    const { useFoodsStore } = await import('./foodsStore');
    const byId = useFoodsStore.getState().byId;
    // Purge des remplacements devenus interdits (source OU cible désormais exclue).
    const foodSwaps = { ...(settings.foodSwaps ?? {}) };
    for (const [from, to] of Object.entries(foodSwaps)) {
      if (isExcluded(byId(to), tags) || isExcluded(byId(from), tags)) delete foodSwaps[from];
    }
    await get().saveSettings({ ...settings, excludedTags: tags, foodSwaps });
    await get().rebuildPlan();
  },

  async clearFoodSwap(fromFoodId) {
    const { settings } = get();
    if (!settings?.foodSwaps) return;
    const { [fromFoodId]: _removed, ...foodSwaps } = settings.foodSwaps;
    void _removed;
    await get().saveSettings({ ...settings, foodSwaps });
    await get().rebuildPlan();
  },

  async swapForDay(dateKey, slot, fromFoodId, to) {
    const { settings } = get();
    if (!settings) return;
    const { useFoodsStore } = await import('./foodsStore');
    const byId = useFoodsStore.getState().byId;
    // Part du plan effectif de la date (snapshot existant, sinon template du jour) :
    // on ne réécrit que l'aliment visé, le reste de la journée est préservé tel quel.
    const current = getTemplateForDate(dateKey, settings);
    const next = swapInDayPlan(current, slot, fromFoodId, to, byId);
    const today = todayKey();
    const planSnapshots = { ...(settings.planSnapshots ?? {}) };
    // Purge du passé au passage (même règle que le gel automatique).
    for (const d of Object.keys(planSnapshots)) if (d < today) delete planSnapshots[d];
    planSnapshots[dateKey] = next;
    await get().saveSettings({ ...settings, planSnapshots });
  },

  async applyRefeedToday() {
    const { profile, settings } = get();
    if (!profile || !settings) return;
    const [{ useFoodsStore }, { useWeightStore }, { mealsRepo }] = await Promise.all([
      import('./foodsStore'),
      import('./weightStore'),
      import('@/services/repositories')
    ]);
    const fs = useFoodsStore.getState();
    const weights = useWeightStore.getState().weights;
    const meals = await mealsRepo.all();

    // Mêmes entrées que RefeedCard : maintenance mesurée si dispo, sinon formule ; protéines
    // courantes tenues constantes. Le garde `recommended` évite d'appliquer un refeed hors
    // sèche ou à %MG trop haut (où il n'a pas de sens).
    const deficit = settings.deficitKcal ?? 0;
    const est = estimateMaintenance(meals, fs.byId, weights, MAINTENANCE_WINDOW_DAYS);
    const maintenanceKcal = est.ok ? est.tdee : Math.round(tdee(profile));
    const currentProteinG = profile.targetProteinG ?? proteinTargetG(profile, deficit);
    const g = refeedGuidance(profile, maintenanceKcal, currentProteinG, deficit);
    if (!g.recommended || !g.macros) return;

    const today = todayKey();
    // Re-scale le plan effectif d'aujourd'hui (mêmes aliments, snapshot ou template) sur les
    // macros de recharge. On ne touche NI la rotation NI les cibles persistées : c'est une
    // déviation d'un seul jour, figée en snapshot du jour et purgée demain.
    // Séance déjà déclarée : la recharge porte sur le plan d'AVANT la séance, puis la
    // séance est ré-appliquée par-dessus (l'annuler ensuite garde la recharge).
    const training = settings.trainingDay?.date === today ? settings.trainingDay : undefined;
    const base = training ? (training.previous ?? templateWithoutSnapshot(today, settings)) : getTemplateForDate(today, settings);
    const scaledDay = scaleRotationToTargets(
      { [today]: base }, g.macros.kcal, g.macros.protein, g.macros.fat, fs.byId
    )[today];

    // Purge le passé, garde le futur, écrase le jour avec le plan de recharge.
    const planSnapshots: Record<string, PlanTemplateMeal[]> = {};
    for (const [date, plan] of Object.entries(settings.planSnapshots ?? {})) {
      if (date > today) planSnapshots[date] = plan;
    }
    planSnapshots[today] = training ? trainingPlan(scaledDay, settings, fs.byId) : scaledDay;
    await get().saveSettings({
      ...settings,
      planSnapshots,
      lastRefeedDate: today,
      ...(training ? { trainingDay: { date: today, previous: scaledDay } } : {})
    });
  },

  async clearRefeedToday() {
    const { settings } = get();
    if (!settings) return;
    const today = todayKey();
    const planSnapshots = { ...(settings.planSnapshots ?? {}) };
    // Retire le snapshot du jour (retour au plan de sèche du template) et purge le passé.
    delete planSnapshots[today];
    for (const d of Object.keys(planSnapshots)) if (d < today) delete planSnapshots[d];
    const { lastRefeedDate: _r, ...restSettings } = settings;
    void _r;
    // Séance déclarée : on la ré-applique sur le plan de sèche retrouvé.
    if (settings.trainingDay?.date === today) {
      const { useFoodsStore } = await import('./foodsStore');
      const byId = useFoodsStore.getState().byId;
      const base = templateWithoutSnapshot(today, settings);
      planSnapshots[today] = trainingPlan(base, settings, byId);
      await get().saveSettings({ ...restSettings, planSnapshots, trainingDay: { date: today } });
      return;
    }
    await get().saveSettings({ ...restSettings, planSnapshots });
  },

  async applyTrainingToday() {
    const { settings } = get();
    if (!settings) return;
    const today = todayKey();
    if (settings.trainingDay?.date === today) return;
    const { useFoodsStore } = await import('./foodsStore');
    const byId = useFoodsStore.getState().byId;
    // Plan effectif du jour (recharge, remplacement ponctuel… inclus), mémorisé tel quel
    // pour pouvoir le restaurer à l'identique si la séance est annulée.
    const previous = settings.planSnapshots?.[today];
    const planSnapshots = futureSnapshots(settings, today);
    planSnapshots[today] = trainingPlan(getTemplateForDate(today, settings), settings, byId);
    await get().saveSettings({ ...settings, planSnapshots, trainingDay: { date: today, previous } });
  },

  async clearTrainingToday() {
    const { settings } = get();
    if (!settings) return;
    const today = todayKey();
    const planSnapshots = futureSnapshots(settings, today);
    const previous = settings.trainingDay?.date === today ? settings.trainingDay.previous : undefined;
    if (previous) planSnapshots[today] = previous;
    else delete planSnapshots[today];
    const { trainingDay: _t, ...restSettings } = settings;
    void _t;
    await get().saveSettings({ ...restSettings, planSnapshots });
  },

  async setEstimateSurplus(date, kcal) {
    const { settings } = get();
    if (!settings) return;
    const value = Math.max(0, Math.round(kcal));
    if ((settings.estimateSurplus?.[date] ?? 0) === value) return;
    // Un surplus ne sert qu'aux jours de report qui suivent : au-delà, on l'oublie.
    const oldest = dayKey(addDays(new Date(), -MAX_CARRY_DAYS));
    const estimateSurplus: Record<string, number> = {};
    for (const [d, v] of Object.entries(settings.estimateSurplus ?? {})) if (d >= oldest) estimateSurplus[d] = v;
    if (value > 0) estimateSurplus[date] = value;
    else delete estimateSurplus[date];
    await get().saveSettings({ ...settings, estimateSurplus });
  }
}));

/** Template du jour en ignorant un éventuel plan figé pour cette date. */
function templateWithoutSnapshot(dateKey: string, settings: FullSettings): PlanTemplateMeal[] {
  const { [dateKey]: _s, ...others } = settings.planSnapshots ?? {};
  void _s;
  return getTemplateForDate(dateKey, { ...settings, planSnapshots: others });
}

/** Plan de séance du jour, en respectant les exclusions du profil alimentaire. */
function trainingPlan(day: PlanTemplateMeal[], settings: FullSettings, byId: (id: string) => Food | undefined): PlanTemplateMeal[] {
  return buildTrainingDayPlan(day, byId, (id) => isExcluded(byId(id), settings.excludedTags));
}
