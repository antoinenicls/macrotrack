import type { Food, GoalMode, MacroTargets, Meal, Profile, Sex, WeightEntry } from '@/types';
import { ACTIVITY_FACTORS } from '@/types';
import { macrosForItem, bmr, minSafeKcal, muscleSafeFloorKcal, maxDeficitFraction, computeMacrosFromGrams, recommendedRateRange, type RateLevel } from './nutrition';
import { buildTrend, adjustmentHint, weightedOlsSlopePerDay, trendStats, projectGoal } from './trend';
import { lastNDays, differenceInCalendarDays, parseDayKey, addDays, dayKey } from './dates';

/** ~7700 kcal stockées par kg de masse corporelle (graisse + un peu d'eau/glycogène). */
const KCAL_PER_KG = 7700;

/**
 * Fenêtre du bilan énergétique (jours). 21 plutôt que 14 : sur une fenêtre courte, la perte de
 * début de sèche est dominée par l'eau et le glycogène (« whoosh »), pas la graisse, donc
 * `Δpoids×7700` surestime la dépense et gonfle la maintenance mesurée les deux premières
 * semaines. Trois semaines diluent cette composante hydrique dans la vraie tendance, et la
 * pondération (cf. MAINTENANCE_HALF_LIFE_DAYS) garde l'estimation réactive malgré la fenêtre
 * plus longue. Réf : méthode adaptative type MacroFactor.
 */
export const MAINTENANCE_WINDOW_DAYS = 21;
/**
 * Demi-vie (jours) de la pondération exponentielle du bilan énergétique. Chaque jour pèse
 * `0.5^(âge/halfLife)` dans la moyenne d'apport ET dans la pente de poids (même référence =
 * le jour le plus récent), si bien que le résultat est une maintenance « à jour » : la fenêtre
 * de 21 j apporte la stabilité, la demi-vie de 10 j la réactivité (un jour vieux de 20 j ne
 * pèse plus qu'un quart d'un jour récent).
 */
export const MAINTENANCE_HALF_LIFE_DAYS = 10;

/**
 * Couverture de logging minimale (jours loggés / jours pesés) pour qu'un bilan
 * énergétique soit fiable. En dessous, des journées « mangées mais non loggées »
 * faussent l'estimation (le poids bouge, l'apport n'est pas compté).
 */
const COVERAGE_MIN = 0.7;
/**
 * Un trou de logging de ce nombre de jours CONSÉCUTIFS (ou plus) à l'intérieur de
 * la période pesée invalide le bilan : c'est typiquement une coupure (voyage,
 * sorties) où l'apport réel ≠ apport loggé. On retombe alors sur l'ajustement de
 * tendance, qui ne dépend que du poids et ne peut pas effondrer la cible.
 */
const MAX_LOGGING_GAP_DAYS = 3;
/**
 * Part maximale des KCAL « estimées » (repas non pesés : extérieur, plat d'un proche,
 * portions à la main) tolérée dans la période pesée pour garder un bilan énergétique
 * FIABLE. Au-delà, l'apport mesuré est trop bruité (estimation ≠ pesée) : on bascule
 * sur l'ajustement par tendance de poids seule, qui reflète la VRAIE conséquence de
 * ces jours sans dépendre de la précision du log → une semaine de sorties ne fausse
 * jamais la maintenance ni n'écrase la cible.
 *
 * Mesurée en kcal et NON en jours : un seul repas estimé par jour (ex. le midi au
 * restaurant universitaire, tout le reste pesé) marquerait sinon ~5 jours sur 7 comme
 * « estimés » et bloquerait la mesure à vie, alors que seule une petite part de l'apport
 * est approximative. Un repas estimé RÉGULIER biaise en outre l'apport de façon
 * constante, biais que le bilan absorbe (maintenance et cible sont dans les mêmes
 * « unités loggées ») : c'est l'estimation irrégulière et massive qu'on écarte ici.
 */
const MAX_ESTIMATED_FRACTION = 0.4;

export interface MaintenanceEstimate {
  ok: true;
  /** Maintenance réelle estimée (kcal/jour). */
  tdee: number;
  /** Apport moyen mesuré sur les jours loggés (kcal/jour). */
  avgIntake: number;
  /** Variation de poids lissée sur la fenêtre (kg ; négatif = perte). */
  weightDeltaKg: number;
  /** Nb de jours réellement loggés dans la fenêtre. */
  loggedDays: number;
  /** Taille de la fenêtre (jours). */
  windowDays: number;
  /** Écart réel mesuré entre l'apport moyen et la maintenance (négatif = déficit). */
  measuredBalance: number;
}

export type MaintenanceResult =
  | MaintenanceEstimate
  | {
      ok: false;
      /**
       * 'logging-gap' : assez de logs au total mais une coupure trop large sur la période pesée.
       * 'too-estimated' : trop de jours « estimés » (non pesés) → apport peu fiable.
       */
      reason: 'no-data' | 'not-enough-logs' | 'not-enough-weights' | 'logging-gap' | 'too-estimated';
      loggedDays: number;
      neededDays: number;
    };

/**
 * Estime la maintenance RÉELLE par bilan énergétique : apport moyen mesuré +
 * énergie tirée (ou stockée) déduite de la variation de poids lissée.
 *   tdee = apportMoyen − (Δpoids·7700 / nbJours)
 * Beaucoup plus précis qu'une formule (Mifflin/Katch) car personnalisé à TON
 * métabolisme réel. Nécessite des logs alimentaires assez réguliers.
 */
export function estimateMaintenance(
  meals: Meal[],
  foodById: (id: string) => Food | undefined,
  weights: WeightEntry[],
  windowDays = MAINTENANCE_WINDOW_DAYS
): MaintenanceResult {
  if (weights.length === 0 && meals.length === 0) {
    return { ok: false, reason: 'no-data', loggedDays: 0, neededDays: Math.ceil(windowDays * 0.6) };
  }

  const windowDates = new Set(lastNDays(windowDays));
  const neededDays = Math.ceil(windowDays * 0.6);

  // Apport kcal par jour (uniquement les jours loggés de la fenêtre)
  const kcalByDate = new Map<string, number>();
  const estimatedDates = new Set<string>(); // jours avec ≥1 repas "mangé dehors" (intentionnel)
  const estimatedKcalByDate = new Map<string, number>(); // part estimée (non pesée) de l'apport du jour
  for (const m of meals) {
    if (!windowDates.has(m.date)) continue;
    let k = 0, estK = 0;
    for (const it of m.items) {
      const ik = macrosForItem(foodById(it.foodId), it).kcal;
      k += ik;
      if (it.estimate) estK += ik;
    }
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + k);
    if (m.items.some((it) => it.estimate)) {
      estimatedDates.add(m.date);
      estimatedKcalByDate.set(m.date, (estimatedKcalByDate.get(m.date) ?? 0) + estK);
    }
  }
  // Écarte les journées au logging INCOMPLET : un jour loggé bien en dessous de la
  // médiane est presque sûrement un oubli (ex. dîner non saisi). Les inclure tirerait
  // l'apport moyen — et donc la maintenance mesurée — artificiellement vers le bas
  // (cible trop basse). On garde les jours ≥ 50 % de la médiane, OU explicitement
  // tagués « mangé à l'extérieur » (écart assumé et estimé → journée intentionnelle).
  const dayTotals = [...kcalByDate.entries()].filter(([, k]) => k > 0);
  const sortedKcals = dayTotals.map(([, k]) => k).sort((a, b) => a - b);
  const median = sortedKcals.length ? sortedKcals[Math.floor(sortedKcals.length / 2)] : 0;
  const completenessFloor = median * 0.5;
  // Jours « complets » (date → kcal) qu'on accepte de compter dans le bilan.
  const loggedByDate = new Map(
    dayTotals.filter(([date, k]) => k >= completenessFloor || estimatedDates.has(date))
  );
  const loggedDays = loggedByDate.size;
  if (loggedDays < neededDays) {
    return { ok: false, reason: 'not-enough-logs', loggedDays, neededDays };
  }

  // Variation de poids lissée (moyenne mobile 7j) entre le début et la fin de la fenêtre
  const trend = buildTrend(weights, windowDays, 7).filter((p) => p.avg != null);
  if (trend.length < 2) {
    return { ok: false, reason: 'not-enough-weights', loggedDays, neededDays };
  }
  const first = trend[0];
  const last = trend[trend.length - 1];
  const spanDays = Math.max(1, differenceInCalendarDays(parseDayKey(last.date), parseDayKey(first.date)));
  if (spanDays < 7) {
    return { ok: false, reason: 'not-enough-weights', loggedDays, neededDays };
  }

  // Le bilan énergétique n'est valide que si l'apport mesuré couvre LES MÊMES jours
  // que la variation de poids. On restreint donc l'apport à la période pesée
  // [first.date … last.date] et on vérifie qu'elle est bien remplie : sinon des
  // journées « mangées mais non loggées » (sorties, voyage) feraient bouger le poids
  // sans peser dans l'apport → maintenance sous-estimée → cible (et glucides) écrasés.
  // On garde l'ÂGE (jours depuis le jour le plus récent du span) de chaque jour loggé pour
  // pondérer ensuite l'apport moyen : un jour récent doit peser plus qu'un jour de 3 semaines.
  const spanKcals: Array<{ age: number; k: number }> = [];
  let maxGap = 0;
  let curGap = 0;
  let totalKcalInSpan = 0;
  let estimatedKcalInSpan = 0;
  const spanEnd = parseDayKey(last.date);
  for (let d = parseDayKey(first.date); d <= spanEnd; d = addDays(d, 1)) {
    const key = dayKey(d);
    const k = loggedByDate.get(key);
    if (k != null) {
      spanKcals.push({ age: differenceInCalendarDays(spanEnd, d), k });
      totalKcalInSpan += k;
      estimatedKcalInSpan += estimatedKcalByDate.get(key) ?? 0;
      curGap = 0;
    } else {
      curGap += 1;
      if (curGap > maxGap) maxGap = curGap;
    }
  }
  const spanCalendarDays = spanDays + 1; // bornes incluses
  const coverage = spanKcals.length / spanCalendarDays;
  if (coverage < COVERAGE_MIN || maxGap >= MAX_LOGGING_GAP_DAYS) {
    return { ok: false, reason: 'logging-gap', loggedDays: spanKcals.length, neededDays };
  }
  // Trop de kcal estimées sur la période → apport pas assez fiable pour un bilan
  // énergétique : on laisse la tendance de poids piloter l'ajustement.
  if (totalKcalInSpan > 0 && estimatedKcalInSpan / totalKcalInSpan > MAX_ESTIMATED_FRACTION) {
    return { ok: false, reason: 'too-estimated', loggedDays: spanKcals.length, neededDays };
  }

  // Apport moyen PONDÉRÉ par récence (même demi-vie que la pente de poids, cf. bilan
  // énergétique cohérent) : la maintenance reflète surtout les jours récents.
  const decay = Math.LN2 / MAINTENANCE_HALF_LIFE_DAYS;
  let wSum = 0, wkSum = 0;
  for (const { age, k } of spanKcals) {
    const w = Math.exp(-decay * age);
    wSum += w; wkSum += w * k;
  }
  const avgIntake = wkSum / wSum;

  // Δpoids par RÉGRESSION linéaire PONDÉRÉE sur les pesées de la période : robuste à un pic
  // d'eau isolé (cheat meal), et les jours récents pèsent plus (fenêtre longue mais réactive).
  // balance/jour = pente·7700.
  const spanWeights = weights.filter((wt) => wt.date >= first.date && wt.date <= last.date);
  const slopePerDay = weightedOlsSlopePerDay(spanWeights, MAINTENANCE_HALF_LIFE_DAYS);
  const balancePerDay =
    (slopePerDay != null ? slopePerDay : (last.avg! - first.avg!) / spanDays) * KCAL_PER_KG; // négatif = déficit réel
  const weightDeltaKg = slopePerDay != null ? slopePerDay * spanDays : last.avg! - first.avg!;
  const realTdee = Math.round(avgIntake - balancePerDay);

  return {
    ok: true,
    tdee: realTdee,
    avgIntake: Math.round(avgIntake),
    weightDeltaKg,
    loggedDays: spanKcals.length,
    windowDays,
    measuredBalance: Math.round(balancePerDay)
  };
}

/* =========================================================================
 *  Cible adaptative : QUELLE cible calorique l'app doit appliquer d'elle-même.
 *  Source de vérité unique, utilisée à la fois par l'auto-application (au moment
 *  d'une pesée) et par l'affichage du Coach. Pure, sans I/O.
 * ========================================================================= */

export type AdaptiveSource =
  | 'measured'      // maintenance réelle mesurée → cible = maintenance − déficit (absolue, auto-corrige)
  | 'trend-nudge'   // pas assez de logs : on corrige la cible de ±150 selon le rythme de perte
  | 'in-range'      // rythme dans la cible : on garde la cible actuelle
  | 'formula';      // données insuffisantes : repli sur la formule (BMR/TDEE − déficit)

export interface AdaptiveTargetResult {
  /** Cible calorique que l'app doit appliquer (kcal/jour). */
  targetKcal: number;
  source: AdaptiveSource;
  /** Maintenance estimée si mesurée, sinon null (pour l'affichage). */
  maintenanceKcal: number | null;
  /** Correction de tendance appliquée CE coup-ci (±150), 0 sinon. */
  nudgeKcal: number;
  /**
   * Plancher calorique réellement appliqué (préservation musculaire en sèche, sinon
   * plancher BMR / absolu). L'appelant DOIT réutiliser ce plancher plutôt que d'en
   * recalculer un autre, sinon la cible pourrait repasser sous le seuil sûr.
   */
  floorKcal: number;
  /**
   * Vrai quand le déficit demandé a été PLAFONNÉ par la préservation musculaire (la cible
   * a été relevée au-dessus de ce que le rythme visé réclamait). Signal « ta sèche était
   * trop agressive » à afficher.
   */
  deficitCapped: boolean;
  /**
   * Nouvel offset de tendance cumulé à PERSISTER (kcal). Repart de l'offset reçu,
   * incrémenté de `nudgeKcal` quand une correction est déclenchée. L'appelant ne le
   * sauvegarde que s'il applique réellement la correction (garde hebdo).
   */
  trendAdjustKcal: number;
  /** Phrase prête à afficher expliquant d'où vient la cible. */
  note: string;
  /**
   * Vrai quand la maintenance MESURÉE existait mais était ABERRANTE (sous BMR×1,2 = niveau
   * sédentaire, incompatible avec un sujet actif) : sous-loggage massif ou adaptation extrême.
   * Dans ce cas la mesure est REJETÉE (cible calée sur la maintenance théorique) et l'appelant
   * NE DOIT PAS calibrer `measuredActivityFactor` dessus ; il doit au contraire réinitialiser
   * un facteur déjà pollué vers le bas. Cf. profileStore.recalcTargetsFromWeight.
   */
  measuredImplausible?: boolean;
}

/**
 * Décide la cible calorique à appliquer automatiquement, par ordre de fiabilité.
 * Modèle : cible = formule(TDEE − déficit) + `offset de tendance` cumulé, sauf si
 * une maintenance RÉELLE est mesurée (qui prime, étant absolue et auto-corrective).
 *
 *  1. Maintenance mesurée (bilan énergétique) → cible = maintenance − déficit.
 *     L'offset reste mémorisé mais inutilisé tant que la mesure est dispo.
 *  2. Sinon, repli "anti-stagnation" sur le rythme de perte lissé :
 *       - trop lent  (<0,2 kg/sem) → offset −150
 *       - trop rapide (>0,7 kg/sem) → offset +150 (préserve le muscle)
 *     L'appelant limite l'incrément à ~1×/semaine (anti-cumul).
 *  3. Rythme dans la cible → formule + offset courant (on ne bouge pas l'offset).
 *  4. Pas assez de données (<7 pesées) → formule + offset courant.
 *
 * `trendAdjustKcal` en entrée = offset cumulé actuel (0 au départ).
 */
export function computeAdaptiveTarget(
  profile: Profile,
  deficitKcal: number,
  trendAdjustKcal: number,
  meals: Meal[],
  foodById: (id: string) => Food | undefined,
  weights: WeightEntry[],
  /**
   * Facteur d'activité CALIBRÉ sur ton métabolisme réel (maintenance mesurée / BMR),
   * mémorisé une fois la mesure débloquée. Utilisé pour la formule de repli (jours sans
   * assez de logs) afin qu'elle colle à TOI au lieu du 1,5 générique. Défaut = facteur
   * théorique de ton niveau d'activité.
   */
  activityFactor?: number,
  /**
   * Garde anti-emballement du rythme. `true` (défaut) : quand le rythme réel dépasse la
   * cible, la cible est corrigée de ±150 pour rester saine — en SÈCHE elle est RELEVÉE
   * (préserve le muscle), en PRISE DE MASSE elle est ABAISSÉE (limite le gras / lean
   * bulk). `false` : on assume un rythme agressif (sèche rapide / dirty bulk), la cible
   * n'est jamais corrigée pour ralentir. La correction "trop lent" reste active dans les
   * deux cas, et le plancher de sécurité BMR aussi.
   */
  slowdownGuardEnabled = true,
  /** Direction de l'objectif : pilote messages, signe du surplus/déficit et garde. */
  mode: GoalMode = 'cut',
  /**
   * Réglage AVANCÉ. `false` (défaut) : plancher de sécurité BMR appliqué — la cible ne
   * descend jamais sous le métabolisme de base. `true` : plancher BMR retiré (utilisateur
   * averti qui juge son BMR trop haut) — seul le plancher ABSOLU (1500 H / 1200 F) subsiste.
   * Cf. minSafeKcal / AppSettings.allowBelowBmr.
   */
  allowBelowBmr = false
): AdaptiveTargetResult {
  const est = estimateMaintenance(meals, foodById, weights, MAINTENANCE_WINDOW_DAYS);
  const factor = activityFactor ?? ACTIVITY_FACTORS[profile.activity];
  const formula = Math.round(bmr(profile) * factor - deficitKcal);

  // Phrase « cible = maintenance ± X » orientée par le signe du déficit (négatif = surplus).
  const targetPhrase =
    deficitKcal > 0 ? `cible = maintenance − ${deficitKcal} kcal (déficit)`
    : deficitKcal < 0 ? `cible = maintenance + ${-deficitKcal} kcal (surplus)`
    : 'cible = maintenance';

  // Garde-fou de PLAUSIBILITÉ de la maintenance mesurée. Un `estimateMaintenance` qui
  // ressort à/sous BMR × 1,2 (niveau d'une personne SÉDENTAIRE) n'est pas crédible pour
  // quelqu'un qui bouge/s'entraîne : ça trahit un sous-loggage (on mange plus qu'on ne
  // saisit → l'app croit qu'on maintient sur très peu) OU une adaptation extrême.
  //
  // ⚠️ Ne PAS la clamper au sédentaire (BMR × 1,2) et la garder comme "mesurée" : ça colle
  // la cible au BMR pour un sujet actif ET pollue le facteur d'activité mesuré vers le bas
  // (spirale : cible basse → sous-alim → mesure basse → cible encore plus basse). Quand elle
  // est aberrante, on la REJETTE et on repart de la maintenance THÉORIQUE au niveau
  // d'activité DÉCLARÉ. `refFactor` ne descend jamais sous le niveau déclaré, pour qu'un
  // `measuredActivityFactor` déjà pollué (tiré vers 1,2) ne sabote pas ce repli.
  const MEASURED_MIN_FACTOR = 1.2;
  const implausibleFloorKcal = Math.round(bmr(profile) * MEASURED_MIN_FACTOR);
  const measuredImplausible = est.ok && est.tdee < implausibleFloorKcal;
  const refFactor = Math.max(factor, ACTIVITY_FACTORS[profile.activity]);
  const theoreticalMaintenance = Math.round(bmr(profile) * refFactor);
  // Mesure retenue UNIQUEMENT si crédible ; sinon on ne s'en sert ni pour la cible ni pour
  // calibrer le facteur d'activité (l'appelant voit maintenanceKcal = null + le flag).
  const measuredTdee = est.ok && !measuredImplausible ? est.tdee : null;

  // Maintenance de référence pour le plancher de préservation musculaire :
  //  - mesurée crédible → elle-même ;
  //  - mesurée ABERRANTE → maintenance théorique (jamais le sédentaire, cf. refFactor) ;
  //  - pas assez de logs → formule sur le facteur passé (respecte une calibration légitime,
  //    même basse : on ne remonte PAS artificiellement le plancher dans ce cas).
  const maintenanceForFloor =
    measuredTdee ?? (measuredImplausible ? theoreticalMaintenance : Math.round(bmr(profile) * factor));
  const bmrFloor = minSafeKcal(profile);

  // Plancher appliqué. En SÈCHE : préservation musculaire — la cible ne retire jamais plus
  // qu'une fraction (indexée sur le %MG) du maintien, ce qui la tient à distance du BMR.
  // Hors sèche : plancher BMR / absolu classique. La cible n'est JAMAIS prescrite sous ce
  // seuil, peu importe le déficit ou les ajustements cumulés.
  const floorKcal =
    mode === 'cut'
      ? muscleSafeFloorKcal(profile, maintenanceForFloor, { allowBelowBmr })
      : minSafeKcal(profile, { allowBelowBmr });

  // Quand le plancher mord, on ne coupe pas davantage : on suggère d'augmenter la dépense
  // (cardio / pas / NEAT) plutôt que l'apport. En prise de masse la cible est au-dessus de
  // la maintenance : le plancher ne peut pas mordre (note vide).
  const floorNote = (raw: number) => {
    if (mode !== 'cut' || raw >= floorKcal) return '';
    if (allowBelowBmr) {
      return ` Plancher absolu de sécurité ${floorKcal} kcal appliqué (planchers BMR et préservation musculaire désactivés : sèche agressive assumée ; surveille énergie, sommeil, force et récupération).`;
    }
    if (floorKcal > bmrFloor) {
      const pct = Math.round(maxDeficitFraction(profile) * 100);
      return ` Cible relevée à ${floorKcal} kcal : ton rythme visé demandait un déficit qui t'aurait rapproché de ton métabolisme de base, ce qui fait fondre le muscle. On plafonne le déficit à ${pct} % de ta maintenance. Pour perdre plus vite, augmente la dépense (cardio / +1000-2000 pas/j) plutôt que l'apport.`;
    }
    return ` Plancher de sécurité ${floorKcal} kcal appliqué (jamais sous ton métabolisme de base).` +
      ' Pour perdre plus vite sans couper davantage, augmente la dépense (cardio / +1000-2000 pas/j) plutôt que l’apport.';
  };
  const capped = (raw: number) => mode === 'cut' && raw < floorKcal;

  // Maintenance mesurée CRÉDIBLE : source de vérité.
  if (est.ok && measuredTdee != null) {
    const raw = Math.round(measuredTdee - deficitKcal);
    return {
      targetKcal: Math.max(floorKcal, raw),
      source: 'measured',
      maintenanceKcal: measuredTdee,
      nudgeKcal: 0,
      floorKcal,
      deficitCapped: capped(raw),
      trendAdjustKcal,
      note: `Maintenance mesurée ≈ ${Math.round(measuredTdee)} kcal → ${targetPhrase}.` + floorNote(raw)
    };
  }

  // Maintenance mesurée ABERRANTE (sous BMR × 1,2) : on la REJETTE et on cale la cible sur la
  // maintenance THÉORIQUE (niveau d'activité déclaré), pas sur le sédentaire, sinon la cible
  // se colle au BMR. maintenanceKcal reste null → l'appelant ne calibre pas le facteur dessus
  // et réinitialise un facteur pollué (cf. measuredImplausible).
  if (est.ok && measuredImplausible) {
    const raw = Math.round(theoreticalMaintenance - deficitKcal);
    return {
      targetKcal: Math.max(floorKcal, raw),
      source: 'formula',
      maintenanceKcal: null,
      nudgeKcal: 0,
      floorKcal,
      deficitCapped: capped(raw),
      trendAdjustKcal,
      measuredImplausible: true,
      note: `Tes logs donnent une maintenance de ${Math.round(est.tdee)} kcal, ANORMALEMENT basse (à/sous ton métabolisme de base) : tu manges nettement plus que tu ne saisis (huile de cuisson, boissons, portions non pesées) ou tu sous-logues sévèrement. On ne s'y fie donc pas : on retient ta maintenance ESTIMÉE à ${theoreticalMaintenance} kcal (formule sur ton niveau d'activité) → ${targetPhrase}. Pèse et logue TOUT pendant ~2 semaines pour débloquer une cible mesurée sur ton vrai métabolisme.` + floorNote(raw)
    };
  }

  // Le rythme visé découle directement du déficit SIGNÉ (déficit·7 / 7700 ; négatif =
  // cible de gain). Ainsi la détection de stagnation s'adapte à l'objectif ET à la
  // direction : en Maintien (déficit 0), la cible est 0 et un poids stable n'est PAS
  // « trop lent » ; en prise de masse, ne pas grossir déclenche une hausse du surplus.
  const targetLossKgPerWeek = (deficitKcal * 7) / KCAL_PER_KG;
  const hint = adjustmentHint(weights, targetLossKgPerWeek, mode);

  // Garde désactivée : on n'applique PAS la correction anti-trop-rapide. On laisse filer
  // le rythme rapide (sèche agressive / dirty bulk assumé), sans toucher au plancher de
  // sécurité qui reste appliqué plus bas.
  if (hint.kind === 'too-fast' && !slowdownGuardEnabled) {
    const raw = formula + trendAdjustKcal;
    const rate = hint.weeklyKgPerWeek != null ? Math.abs(hint.weeklyKgPerWeek).toFixed(2) : '?';
    const note = mode === 'bulk'
      ? `Prise rapide (${rate} kg/sem) : garde lean-bulk désactivée, ta cible n'est pas abaissée.`
      : `Perte rapide (${rate} kg/sem) : garde anti-trop-rapide désactivée, ta cible n'est pas remontée.`;
    return {
      targetKcal: Math.max(floorKcal, raw),
      source: 'in-range',
      maintenanceKcal: null,
      nudgeKcal: 0,
      floorKcal,
      deficitCapped: capped(raw),
      trendAdjustKcal,
      note: note + floorNote(raw)
    };
  }

  if (hint.kind === 'too-slow' || hint.kind === 'too-fast') {
    // Plafonne l'offset cumulé pour éviter toute dérive si la maintenance mesurée
    // n'est jamais disponible (±600 kcal max autour de la formule).
    const nextOffset = Math.max(-600, Math.min(600, trendAdjustKcal + hint.deltaKcal));
    const raw = formula + nextOffset;
    return {
      targetKcal: Math.max(floorKcal, raw),
      source: 'trend-nudge',
      maintenanceKcal: null,
      nudgeKcal: hint.deltaKcal,
      floorKcal,
      deficitCapped: capped(raw),
      trendAdjustKcal: nextOffset,
      note: hint.message + floorNote(raw)
    };
  }

  // in-range ou insufficient-data : formule + offset courant (offset inchangé).
  const raw = formula + trendAdjustKcal;
  return {
    targetKcal: Math.max(floorKcal, raw),
    source: hint.kind === 'in-range' ? 'in-range' : 'formula',
    maintenanceKcal: null,
    nudgeKcal: 0,
    floorKcal,
    deficitCapped: capped(raw),
    trendAdjustKcal,
    note: hint.message + floorNote(raw)
  };
}

/* =========================================================================
 *  Diet break : pause structurée à maintenance. Pur, sans I/O.
 *  Rationnel : une sèche continue trop longue accentue l'adaptation métabolique et
 *  la baisse hormonale (leptine, T3, testostérone). Une pause à maintenance de 1-2
 *  semaines toutes les 6-12 sem préserve mieux le métabolisme (MATADOR, Byrne 2018).
 * ========================================================================= */

const DAY_MS = 86_400_000;
/** Seuil « pense à une pause » : on entre dans la fenêtre 6-12 sem. */
const DIET_BREAK_SUGGEST_WEEKS = 8;
/** Seuil « pause fortement conseillée » (haut de la fenêtre). */
const DIET_BREAK_URGENT_WEEKS = 12;
/** Chute de maintenance mesurée vs formule (%) trahissant une adaptation marquée. */
const METABOLIC_DROP_PCT = 12;

/**
 * TDEE de RÉFÉRENCE pour juger l'adaptation métabolique (déclencheur de pause diète).
 * L'adaptation se mesure comme l'écart entre la maintenance MESURÉE aujourd'hui et ce que
 * serait la maintenance au poids courant SI le ratio d'activité (NEAT + dépense + TEF) était
 * resté celui du DÉBUT de la sèche. On multiplie donc le BMR courant (qui reflète déjà la
 * masse perdue) par un facteur d'activité `frozenFactor` GELÉ tôt dans la sèche.
 *
 * Ne PAS utiliser `measuredActivityFactor` (ré-étalonné à chaque pesée) comme référence :
 * il chasse la mesure, donc l'écart ressortirait toujours ≈ 0 et le détecteur serait inerte.
 * `frozenFactor` absent (aucun relevé encore figé) → repli sur le facteur théorique du niveau
 * d'activité (population), en connaissant son biais : c'est le déclencheur par DURÉE qui prend
 * alors le relais.
 */
export function referenceTdeeForDrop(
  profile: Pick<Profile, 'sex' | 'ageYears' | 'heightCm' | 'weightKg' | 'bodyFatPct' | 'activity'>,
  frozenFactor?: number | null
): number {
  const factor = frozenFactor ?? ACTIVITY_FACTORS[profile.activity];
  return Math.round(bmr(profile) * factor);
}

export interface DietBreakStatus {
  /** Une sèche continue est-elle en cours (déficit + date de début connue) ? */
  onCut: boolean;
  /** Semaines de sèche continue depuis le début (null si inconnu / hors sèche). */
  weeksOnCut: number | null;
  /** Chute de la maintenance mesurée sous la formule, en % (null si pas mesurée). */
  metabolicDropPct: number | null;
  /** Une pause (diet break) est recommandée. */
  recommended: boolean;
  /** Au-delà de 12 sem continues → fortement conseillée. */
  urgent: boolean;
  /** Message prêt à afficher (null si rien à signaler). */
  message: string | null;
}

/**
 * Évalue si une pause diète est recommandée, sur deux déclencheurs (l'un OU l'autre) :
 *  - durée : ≥ 8 sem de sèche continue (fortement conseillée ≥ 12 sem) ;
 *  - adaptation : maintenance mesurée nettement sous la formule (≥ 12 %).
 * Purement informatif — l'app ne force rien. `cutStartedAt` absent → onCut=false.
 */
export function dietBreakStatus(opts: {
  cutStartedAt?: number;
  now?: number;
  measuredTdee?: number | null;
  formulaTdee?: number | null;
}): DietBreakStatus {
  const { cutStartedAt, now = Date.now(), measuredTdee, formulaTdee } = opts;

  const metabolicDropPct =
    measuredTdee != null && formulaTdee != null && formulaTdee > 0
      ? Math.round(((formulaTdee - measuredTdee) / formulaTdee) * 100)
      : null;

  if (cutStartedAt == null) {
    return { onCut: false, weeksOnCut: null, metabolicDropPct, recommended: false, urgent: false, message: null };
  }

  const weeksOnCut = Math.max(0, (now - cutStartedAt) / (7 * DAY_MS));
  const byDuration = weeksOnCut >= DIET_BREAK_SUGGEST_WEEKS;
  const byAdaptation = metabolicDropPct != null && metabolicDropPct >= METABOLIC_DROP_PCT;
  const urgent = weeksOnCut >= DIET_BREAK_URGENT_WEEKS;
  const recommended = byDuration || byAdaptation;

  let message: string | null = null;
  if (recommended) {
    const w = Math.round(weeksOnCut);
    const base = urgent
      ? `Tu es en déficit depuis ~${w} semaines d'affilée. Au-delà de 12 semaines continues, une pause à maintenance de 1-2 semaines est fortement conseillée (relance leptine/T3/testostérone, préserve le métabolisme, étude MATADOR). Pense aussi à un avis diét/médical pour une sèche longue.`
      : byDuration
      ? `Tu es en déficit depuis ~${w} semaines. Une pause à maintenance de 1-2 semaines (diet break) relancerait tes hormones et ton métabolisme avant de reprendre la sèche (étude MATADOR).`
      : `Ta maintenance mesurée a chuté de ~${metabolicDropPct} % sous l'estimation théorique (adaptation métabolique). Une pause à maintenance de 1-2 semaines aiderait à la réenclencher.`;
    message = base;
  }

  return { onCut: true, weeksOnCut, metabolicDropPct, recommended, urgent, message };
}

/* =========================================================================
 *  Récupération : phase à maintenance APRÈS une sèche, pour reconstruire. Pur, sans I/O.
 *  Rationnel : après une sèche (surtout si du muscle a été perdu), 2-3 semaines à
 *  maintenance + entraînement lourd relancent hormones et force et récupèrent une partie
 *  du muscle (mémoire musculaire). Le piège est d'y RESTER bloqué et de ne jamais
 *  relancer la sèche : ce suivi compte les semaines et invite à reprendre le moment venu.
 *  Pendant de `dietBreakStatus` (qui, lui, suggère d'ENTRER en pause).
 * ========================================================================= */

/** Récup jugée « faite », prête à reprendre la sèche. */
const RECOVERY_READY_WEEKS = 2;
/** Au-delà, on stagne : reprendre est vivement conseillé (sinon plus de progression). */
const RECOVERY_OVERDUE_WEEKS = 4;

export interface RecoveryStatus {
  /** Une phase de récupération (maintenance après sèche) est-elle en cours ? */
  onRecovery: boolean;
  /** Semaines écoulées depuis le début de la récup (null si hors récup). */
  weeksOnRecovery: number | null;
  /** Assez récupéré pour reprendre la sèche (≥ 2 sem). */
  ready: boolean;
  /** Trop long à maintenance (≥ 4 sem) : reprendre pour ne pas stagner. */
  overdue: boolean;
  /** Message prêt à afficher (null si rien à signaler). */
  message: string | null;
}

/**
 * Évalue une phase de récupération à maintenance. `recoveryStartedAt` est posé quand
 * l'utilisateur bascule en Maintien EN VENANT d'une sèche (cf. MacroTargetsForm), et
 * effacé dès qu'il quitte le maintien. Purement informatif — l'app ne force rien.
 */
export function recoveryStatus(opts: { recoveryStartedAt?: number; now?: number }): RecoveryStatus {
  const { recoveryStartedAt, now = Date.now() } = opts;
  if (recoveryStartedAt == null) {
    return { onRecovery: false, weeksOnRecovery: null, ready: false, overdue: false, message: null };
  }
  const weeksOnRecovery = Math.max(0, (now - recoveryStartedAt) / (7 * DAY_MS));
  const ready = weeksOnRecovery >= RECOVERY_READY_WEEKS;
  const overdue = weeksOnRecovery >= RECOVERY_OVERDUE_WEEKS;
  const w = Math.round(weeksOnRecovery);
  const message = overdue
    ? `Tu es à maintenance depuis ~${w} semaines. La récup est largement faite : reprends ta sèche douce pour repartir vers ton objectif (rester plus longtemps à maintenance ne construit plus grand-chose).`
    : ready
    ? `Tu es à maintenance depuis ~${w} semaines : la récup a fait son travail (hormones, force, un peu de muscle repris). Tu peux reprendre ta sèche douce quand tu te sens prêt.`
    : `Récupération en cours (~${w} sem). Vise 2-3 semaines à maintenance, entraînement lourd, avant de relancer la sèche.`;
  return { onRecovery: true, weeksOnRecovery, ready, overdue, message };
}

/* =========================================================================
 *  Mini-cut : courte sèche (2-4 sem) au sein d'une prise de masse. Pur, sans I/O.
 *  Symétrique du diet break. Rationnel : une prise de masse trop longue ou menée à un
 *  %MG déjà élevé accumule surtout du gras et dégrade la sensibilité à l'insuline / le
 *  ratio muscle:gras des prises futures. Une mini-sèche remet le %MG dans une zone où le
 *  surplus repart en muscle. Réf : Aragon/Helms (lean bulk & mini-cuts).
 * ========================================================================= */

/** Seuil « pense à un mini-cut » : prise de masse continue longue. */
const MINI_CUT_SUGGEST_WEEKS = 10;
/** Seuil « mini-cut fortement conseillé » (prise très longue). */
const MINI_CUT_URGENT_WEEKS = 16;

export interface MiniCutStatus {
  /** Une prise de masse continue est-elle en cours (surplus + date de début connue) ? */
  onBulk: boolean;
  /** Semaines de prise continue depuis le début (null si inconnu / hors prise). */
  weeksOnBulk: number | null;
  /** %MG estimé au-dessus du seuil « élevé » (H>20 / F>28) → prise surtout graisseuse. */
  bodyFatHigh: boolean;
  /** Un mini-cut est recommandé. */
  recommended: boolean;
  /** Prise très longue → fortement conseillé. */
  urgent: boolean;
  /** Message prêt à afficher (null si rien à signaler). */
  message: string | null;
}

/**
 * Évalue si un mini-cut est recommandé, sur deux déclencheurs (l'un OU l'autre) :
 *  - durée : ≥ 10 sem de prise de masse continue (fortement conseillé ≥ 16 sem) ;
 *  - %MG : masse grasse au-dessus du seuil « élevé » (H>20 / F>28).
 * Purement informatif — l'app ne force rien. `bulkStartedAt` absent → onBulk=false.
 */
export function miniCutStatus(opts: {
  bulkStartedAt?: number;
  now?: number;
  sex?: Sex;
  bodyFatPct?: number | null;
}): MiniCutStatus {
  const { bulkStartedAt, now = Date.now(), sex = 'M', bodyFatPct } = opts;

  const highBf = sex === 'M' ? 20 : 28;
  const bodyFatHigh = typeof bodyFatPct === 'number' && bodyFatPct > 0 && bodyFatPct < 60 && bodyFatPct > highBf;

  if (bulkStartedAt == null) {
    return { onBulk: false, weeksOnBulk: null, bodyFatHigh, recommended: false, urgent: false, message: null };
  }

  const weeksOnBulk = Math.max(0, (now - bulkStartedAt) / (7 * DAY_MS));
  const byDuration = weeksOnBulk >= MINI_CUT_SUGGEST_WEEKS;
  const urgent = weeksOnBulk >= MINI_CUT_URGENT_WEEKS;
  const recommended = byDuration || bodyFatHigh;

  let message: string | null = null;
  if (recommended) {
    const w = Math.round(weeksOnBulk);
    message = urgent
      ? `Tu es en prise de masse depuis ~${w} semaines d'affilée. Au-delà de 16 semaines continues, une mini-sèche de 2-4 semaines remet ton %MG (et ta sensibilité à l'insuline) dans une zone où le surplus repart en muscle plutôt qu'en gras.`
      : byDuration
      ? `Tu es en prise de masse depuis ~${w} semaines. Une mini-sèche de 2-4 semaines aiderait à limiter le gras accumulé avant de reprendre la prise (lean bulk).`
      : `Ton %MG estimé (${bodyFatPct} %) est déjà élevé : à ce niveau une prise de masse ajoute surtout du gras. Une mini-sèche de 2-4 semaines d'abord améliorerait le ratio muscle:gras de la suite.`;
  }

  return { onBulk: true, weeksOnBulk, bodyFatHigh, recommended, urgent, message };
}

/* =========================================================================
 *  Refeed : journée de recharge glucidique (1 jour) à ~maintenance. Pur, sans I/O.
 *  Rationnel : restaurer le glycogène musculaire, soutenir la leptine, la performance
 *  et l'adhérence. Protéines CONSTANTES, glucides ↑, lipides ↓, kcal ≈ maintenance —
 *  la hausse vient EXCLUSIVEMENT des glucides. Réf : Module 4.2.
 * ========================================================================= */

export interface RefeedGuidance {
  /** Un refeed est-il pertinent (uniquement en sèche) ? */
  applicable: boolean;
  /** Niveau de sécheresse déduit du %MG (fréquence recommandée en découle). */
  level: RateLevel;
  /** Fréquence recommandée, indexée sur le %MG. */
  frequencyLabel: string;
  /** Recommandé activement (sec/modéré) vs superflu (encore gras). */
  recommended: boolean;
  /** Macros conseillées pour LE jour de refeed (protéines constantes, lipides bas, glucides = reste). */
  macros: MacroTargets | null;
  /** Glucides du jour de refeed en g/kg de poids (repère : viser ~4-6). */
  carbsPerKg: number | null;
  note: string;
}

/**
 * Calcule la recommandation de refeed. Fréquence indexée sur le %MG :
 *   %MG bas (H<12/F<22)   → 1 à 2 refeeds/semaine
 *   %MG modéré            → 1 refeed/semaine à /2 semaines
 *   %MG élevé (H>20/F>28) → superflu tant qu'on n'est pas sec
 * Le jour de refeed : kcal ramenées à la maintenance, protéines INCHANGÉES, lipides
 * abaissés à ~0,5 g/kg (le temps d'un jour), glucides = tout le reste (≈ 4-6 g/kg).
 * `applicable` seulement en sèche (`deficitKcal > 0`). `maintenanceKcal` = maintenance
 * mesurée si dispo, sinon TDEE formule ; `currentProteinG` = protéines cibles actuelles.
 */
export function refeedGuidance(
  profile: Pick<Profile, 'weightKg' | 'sex' | 'bodyFatPct'>,
  maintenanceKcal: number,
  currentProteinG: number,
  deficitKcal: number
): RefeedGuidance {
  const level = recommendedRateRange(profile).level;
  const applicable = deficitKcal > 0;
  const frequencyLabel =
    level === 'low' ? '1 à 2 refeeds / semaine'
    : level === 'moderate' ? '1 refeed / semaine à toutes les 2 semaines'
    : 'Superflu tant que tu n’es pas sec (garde-le pour plus tard dans la sèche)';
  const recommended = applicable && level !== 'high';

  if (!applicable) {
    return {
      applicable: false, level, frequencyLabel, recommended: false,
      macros: null, carbsPerKg: null,
      note: 'Les refeeds n’ont de sens qu’en sèche (déficit actif). Au maintien, tu manges déjà à la maintenance.'
    };
  }

  // Jour de refeed : protéines constantes, lipides ↓ à ~0,5 g/kg, glucides = reste à maintenance.
  const fatG = Math.round(0.5 * profile.weightKg);
  const macros = computeMacrosFromGrams(maintenanceKcal, currentProteinG, fatG);
  const carbsPerKg = profile.weightKg > 0 ? macros.carbs / profile.weightKg : null;

  const note = recommended
    ? `Environ 1 jour ${frequencyLabel.toLowerCase()}, mange à ta maintenance : protéines inchangées, lipides bas (~${fatG} g), et le reste EN GLUCIDES (~${macros.carbs} g${carbsPerKg ? `, soit ${carbsPerKg.toFixed(1)} g/kg` : ''}). Idéalement un jour d’entraînement. Le lendemain, tu reprends ta cible normale.`
    : 'À ton %MG actuel, un refeed n’est pas prioritaire : il devient utile quand tu seras plus sec (faim/perf/glycogène qui tirent). Tu peux quand même en placer un ponctuellement.';

  return { applicable, level, frequencyLabel, recommended, macros, carbsPerKg, note };
}

/* =========================================================================
 *  Bilan hebdomadaire : un point « comme un coach » 1×/semaine. Pur, sans I/O.
 *  Récapitule tendance, maintenance mesurée, assiduité de logging et objectif —
 *  pour comprendre la semaine en un coup d'œil, sans aucune saisie supplémentaire.
 * ========================================================================= */

export interface WeeklyReview {
  /** Jours réellement loggés sur les 7 derniers (assiduité). */
  loggedDays: number;
  /** Rythme de poids lissé (kg/sem ; négatif = perte). */
  weeklyRateKg: number | null;
  /** Maintenance réelle si mesurée, sinon null. */
  measuredTdee: number | null;
  /** Cible calorique actuellement appliquée. */
  targetKcal: number | null;
  /** Objectif (si poids cible défini). */
  goalRemainingKg: number | null;
  goalEtaDate: string | null;
  goalOnTrack: boolean;
  /** L'objectif vient d'être atteint (bascule maintien) dans la semaine écoulée. */
  goalJustReached: boolean;
  /** Verdict court de la semaine. */
  headline: string;
  /** Détail du rythme (réutilise le message d'ajustement, relatif à l'objectif). */
  rateNote: string;
  /** Note d'assiduité de logging. */
  adherenceNote: string;
  /** Statut « pause diète » (diet break) — recommandation seulement, jamais forcée (sèche). */
  dietBreak: DietBreakStatus;
  /** Statut « mini-cut » — recommandation seulement, jamais forcée (prise de masse). */
  miniCut: MiniCutStatus;
}

export function buildWeeklyReview(
  meals: Meal[],
  foodById: (id: string) => Food | undefined,
  weights: WeightEntry[],
  opts: {
    targetKcal: number | null;
    deficitKcal: number;
    /** Direction de l'objectif. Défaut inféré du signe de deficitKcal. */
    mode?: GoalMode;
    goalWeightKg?: number;
    goalReachedAt?: number;
    /** Garde anti-trop-rapide (cf. computeAdaptiveTarget). Défaut true. */
    slowdownGuardEnabled?: boolean;
    /** Début de la sèche continue (ms) — pour le déclencheur diet break par durée. */
    cutStartedAt?: number;
    /** Début de la prise de masse continue (ms) — pour le déclencheur mini-cut par durée. */
    bulkStartedAt?: number;
    /** %MG et sexe — pour le déclencheur mini-cut par %MG élevé. */
    sex?: Sex;
    bodyFatPct?: number;
    /** Maintenance théorique (TDEE formule) — pour le déclencheur par adaptation. */
    formulaTdee?: number | null;
  }
): WeeklyReview {
  // Direction : mode explicite si fourni, sinon inféré du signe du déficit.
  const mode: GoalMode =
    opts.mode ?? (opts.deficitKcal > 0 ? 'cut' : opts.deficitKcal < 0 ? 'bulk' : 'maintain');
  const last7 = new Set(lastNDays(7));
  const loggedDays = new Set(
    meals.filter((m) => last7.has(m.date) && m.items.length > 0).map((m) => m.date)
  ).size;

  const weeklyRateKg = trendStats(weights).weeklyKgPerWeek;
  const est = estimateMaintenance(meals, foodById, weights, MAINTENANCE_WINDOW_DAYS);
  const measuredTdee = est.ok ? est.tdee : null;

  const targetLoss = (opts.deficitKcal * 7) / KCAL_PER_KG;
  const hint = adjustmentHint(weights, targetLoss, mode);

  const proj = opts.goalWeightKg != null ? projectGoal(weights, opts.goalWeightKg) : null;
  const DAY = 86_400_000;
  const goalJustReached = opts.goalReachedAt != null && Date.now() - opts.goalReachedAt < 7 * DAY;

  // Pause diète : recommandée après une sèche continue longue (ou adaptation marquée).
  // Jamais en maintien (deficit ~0) ni objectif atteint : on ne suggère pas une pause
  // à quelqu'un qui ne coupe déjà plus.
  const dietBreak = dietBreakStatus({
    cutStartedAt: mode === 'cut' && !goalJustReached ? opts.cutStartedAt : undefined,
    measuredTdee,
    formulaTdee: opts.formulaTdee
  });

  // Mini-cut : recommandé après une prise de masse continue longue (ou %MG déjà élevé).
  // Uniquement en prise de masse et hors objectif atteint.
  const miniCut = miniCutStatus({
    bulkStartedAt: mode === 'bulk' && !goalJustReached ? opts.bulkStartedAt : undefined,
    sex: opts.sex,
    bodyFatPct: opts.bodyFatPct
  });

  const headline = goalJustReached
    ? '🎯 Objectif de poids atteint : passage automatique en maintien.'
    : weeklyRateKg == null
    ? 'Pas encore assez de pesées cette semaine pour un bilan fiable.'
    : hint.kind === 'in-range'
    ? (mode === 'bulk' ? 'Prise sur les rails 👍' : 'Semaine sur les rails 👍')
    : mode === 'bulk'
    ? (hint.kind === 'too-slow'
        ? 'Prise plus lente que visé : le surplus va monter.'
        : hint.kind === 'too-fast'
        ? (opts.slowdownGuardEnabled === false
            ? 'Prise rapide : dirty bulk assumé, le surplus ne baisse pas.'
            : 'Prise rapide : le surplus baisse pour limiter le gras.')
        : 'Bilan de la semaine')
    : hint.kind === 'too-slow'
    ? 'Perte plus lente que visé : la cible va se resserrer.'
    : hint.kind === 'too-fast'
    ? (opts.slowdownGuardEnabled === false
        ? 'Perte rapide : sèche agressive assumée, la cible ne remonte pas.'
        : 'Perte rapide : la cible remonte pour préserver le muscle.')
    : 'Bilan de la semaine';

  const adherenceNote =
    loggedDays >= 6
      ? `${loggedDays}/7 jours loggés : assiduité au top, maintenance mesurée fiable.`
      : loggedDays >= 4
      ? `${loggedDays}/7 jours loggés : encore 1-2 jours pour une mesure plus solide.`
      : `${loggedDays}/7 jours loggés : logue davantage pour débloquer la cible mesurée sur ton vrai métabolisme.`;

  return {
    loggedDays,
    weeklyRateKg,
    measuredTdee,
    targetKcal: opts.targetKcal,
    goalRemainingKg: proj?.remainingKg ?? null,
    goalEtaDate: proj?.etaDate ?? null,
    goalOnTrack: proj?.onTrack ?? false,
    goalJustReached,
    headline,
    rateNote: hint.message,
    adherenceNote,
    dietBreak,
    miniCut
  };
}
