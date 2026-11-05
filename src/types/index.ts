export * from './food';
export * from './meal';
export * from './profile';
export * from './weight';

export type ThemeMode = 'system' | 'dark' | 'light';

/**
 * Ingrédient d'APPOINT : un aliment qu'on ajoute à sa diète de façon OCCASIONNELLE, avec un
 * interrupteur « j'en ai / j'en ai pas ». Typiquement la crème de riz en pré-training : on
 * ne l'a pas tous les jours. Quand `available` est vrai, l'aliment est injecté dans son
 * créneau AVANT le calibrage macro → il fait partie du budget calorique et le reste du plan
 * se re-échelonne pour tenir la cible. Quand il est faux, l'aliment disparaît du plan (rien
 * à cocher) et les autres aliments absorbent ses calories. `grams` est une quantité de
 * RÉFÉRENCE (avant scaling), dans l'état indiqué par `cooked`. Contrairement à la rotation
 * curée, un ingrédient d'appoint n'est jamais substitué par un autre du même rôle : il est
 * là ou il n'y est pas.
 */
export interface AddonFood {
  /** Clé STABLE de l'appoint (ex. 'creme-de-riz'). Ne change pas quand on switche de parfum. */
  id: string;
  /** Variante ACTIVE : l'aliment réellement injecté dans le plan. Toujours l'une des `variants`. */
  foodId: string;
  /**
   * Déclinaisons INTERCHANGEABLES du même appoint (parfums, marques) : on n'en consomme
   * qu'une à la fois, l'utilisateur choisit laquelle. Absent = appoint sans variante.
   */
  variants?: Array<{ foodId: string; label: string }>;
  slot: import('./meal').MealSlot;
  grams: number;
  cooked: boolean;
  available: boolean;
}

export interface AppSettings {
  id: 'app';
  /** "system" (suit l'OS, défaut), "dark", ou "light". */
  theme: ThemeMode;
  units: 'metric';
  lastSeedVersion: number;
  /** Version de la rotation hebdomadaire appliquée — bumped si on doit re-pousser. */
  lastRotationVersion?: number;
  iosPromptDismissedAt?: number;
  /** Active les retours haptiques (Android uniquement à ce jour). Par défaut true. */
  hapticEnabled?: boolean;
  /**
   * Préférences par aliment (état d'entrée préféré : "cru" ou "cuit").
   * Utilisé pour pré-cocher le toggle dans la sheet de quantité.
   * Auto-appris quand l'utilisateur change le toggle.
   */
  foodPrefs?: Record<string, { inputState?: 'raw' | 'cooked' }>;
  /**
   * Plans type par jour de la semaine ISO (1=lundi … 7=dimanche).
   * Si absent pour un jour, on retombe sur `planTemplate` (le plan commun).
   * Permet une rotation hebdomadaire (anti-carence, variété).
   */
  weeklyTemplates?: Record<string, import('./meal').PlanTemplateMeal[]>;
  /**
   * Plans FIGÉS par date (YYYY-MM-DD). Une journée déjà entamée ne doit plus voir
   * ses quantités « prévues » bouger même si le coach ré-ajuste la cible en cours de
   * journée (sinon des aliments déjà validés se « dé-valident »). On fige le plan du
   * jour juste avant un ré-ajustement auto ; la nouvelle cible s'applique dès le
   * lendemain. Purgé des dates passées pour rester borné. Clé = dateKey.
   */
  planSnapshots?: Record<string, import('./meal').PlanTemplateMeal[]>;
  /**
   * Dernier jour où un JOUR DE RECHARGE (refeed) a été appliqué en un tap (dateKey
   * YYYY-MM-DD). Le refeed re-scale le plan du jour à la maintenance (protéines inchangées,
   * lipides bas, glucides ↑) via un `planSnapshots` du jour, qui se reverte tout seul le
   * lendemain (purge des snapshots passés). Sert à afficher l'état « appliqué aujourd'hui »
   * et à proposer l'annulation. Purement UI côté coach (n'entre dans aucun calcul de cible).
   */
  lastRefeedDate?: string;
  /**
   * Jour de SÉANCE déclaré (cf. lib/trainingDay) : `date` = jour concerné, `previous` = plan
   * figé de ce jour AVANT la séance (absent = le template du jour), restauré à l'annulation.
   * Comme le refeed, ne vaut que pour la date : le snapshot est purgé le lendemain.
   */
  trainingDay?: { date: string; previous?: import('./meal').PlanTemplateMeal[] };
  /**
   * Surplus NON COMPENSABLE (kcal) d'un jour avec repas estimé, par date : reporté sur les
   * jours suivants (cf. lib/estimateRebalance). Tenu à jour par l'onglet Repas, purgé au-delà
   * de la fenêtre de report.
   */
  estimateSurplus?: Record<string, number>;
  /** Réglages du report de ce surplus (cf. lib/estimateRebalance) : absent = valeurs par défaut. */
  estimateCarry?: { enabled?: boolean; days?: number; minKcal?: number; maxShare?: number };
  /**
   * Nombre de séances prévues par semaine. Ne sert qu'à la liste de courses : les séances
   * se déclarant le jour même, c'est ce chiffre qui fait prévoir galettes / miel / banane.
   */
  trainingSessionsPerWeek?: number;
  /**
   * Aliments que l'utilisateur accepte de manger (IDs). La diète ne compose ses repas
   * QU'À PARTIR de ces aliments : tout aliment de la rotation hors liste est remplacé par
   * un autorisé du même rôle (cf. lib/foodSelection). Absent = TOUS les aliments autorisés
   * (comportement historique, rotation curée intacte). Contrainte : chaque rôle essentiel
   * doit garder ≥1 aliment (la base recommandée est pré-cochée mais remplaçable).
   */
  selectedFoodIds?: string[];
  /**
   * Remplacements DURABLES décidés depuis le menu du jour : aliment d'origine → aliment
   * de remplacement. Appliqués à chaque reconstruction du plan, donc ils survivent aux
   * re-calibrages du coach (contrairement à une modification du plan type, réécrite au
   * prochain rescale). « Toujours remplacer le poulet par de la dinde. »
   * Le remplaçant est ajouté à `selectedFoodIds` au moment du choix : le vouloir dans son
   * menu, c'est l'accepter dans sa diète.
   */
  foodSwaps?: Record<string, string>;
  /**
   * Exclusions STRICTES par étiquette de composition (viande, gluten, lacté…), posées
   * directement ou via un profil alimentaire. Contrairement à `selectedFoodIds`, rien ne
   * les contourne : ni une substitution automatique, ni un remplacement proposé, ni une
   * suggestion du bilan de couverture. C'est ce qui distingue « je n'aime pas » de
   * « je ne peux pas manger ça ». Cf. lib/diet.
   */
  excludedTags?: import('./food').FoodTag[];
  /**
   * Repas ACTIFS de la journée. Absent = les quatre (comportement historique). Les repas
   * désactivés ne sont pas supprimés du plan : leurs aliments sont reversés dans le repas
   * actif le plus proche, donc les calories et les macros du jour sont inchangées.
   * Permet le jeûne 16/8, les trois repas sans collation, etc. Cf. lib/mealStructure.
   */
  activeSlots?: import('./meal').MealSlot[];
  /**
   * Pause diète (vacances, semaine chargée, impossible de se peser sérieusement). Quand
   * elle est active, la cible est TENUE à la maintenance (déficit 0) et le recalcul
   * automatique à chaque pesée est suspendu : entrer un poids ne fait plus bouger les
   * calories du jour. L'objectif (mode + rythme) est conservé et repris tel quel à la
   * sortie de pause. Évite qu'une période sans données fiables déraille la cible, et coupe
   * le déficit le temps de souffler (bénéfique hormonal, cf. diet break).
   */
  dietPaused?: boolean;
  /**
   * Début (ms) d'une phase de RÉCUPÉRATION à maintenance prise APRÈS une sèche. Posé quand
   * l'utilisateur bascule en Maintien en venant d'une sèche, effacé dès qu'il quitte le
   * maintien (reprise de sèche/prise, ou objectif atteint). Sert au rappel « récup faite,
   * reprends ta sèche » (cf. recoveryStatus / RecoveryCard) : le pendant de la pause diète,
   * pour ne pas rester bloqué à maintenance et cesser de progresser. Absent = pas en récup.
   */
  recoveryStartedAt?: number;
  /**
   * Garde-manger : stock déjà possédé par aliment, en grammes d'achat (cru/sec).
   * La liste de courses déduit ce stock du besoin de la semaine
   * (à acheter = max(0, besoin − stock)). Sert à ne pas racheter ce qu'on a
   * déjà (fonds de tiroir, gros conditionnements). Clé = foodId.
   */
  pantry?: Record<string, number>;
  /**
   * Si vrai, recalcule automatiquement targetKcal/macros à chaque nouvelle pesée,
   * basé sur le poids le plus récent + le déficit configuré.
   */
  adaptiveTargets?: boolean;
  /**
   * Direction de l'objectif : sèche / maintien / prise de masse. Source de vérité du
   * SIGNE de `deficitKcal` (positif = déficit, négatif = surplus) et du rythme utilisé
   * (`lossRatePctPerWeek` en sèche, `gainRatePctPerWeek` en prise). Absent = inféré une
   * fois (cf. seed) : déficit/rythme de perte > 0 → 'cut', sinon 'maintain'.
   */
  goalMode?: import('./profile').GoalMode;
  /**
   * Déficit calorique SIGNÉ appliqué quand `adaptiveTargets` est vrai :
   *   positif = déficit (sèche) · négatif = surplus (prise de masse) · 0 = maintien.
   * Défaut 400 (mini-sèche). Quand un rythme %/sem est défini (`lossRatePctPerWeek` en
   * sèche, `gainRatePctPerWeek` en prise), cette valeur n'est plus la source de vérité :
   * elle est RECALCULÉE à chaque pesée à partir du rythme visé × poids courant (cache
   * pour l'affichage / les consommateurs legacy).
   */
  deficitKcal?: number;
  /**
   * Rythme de perte VISÉ, en % du poids corporel par semaine (approche standard en
   * science du sport : Helms/Aragon/Garthe). Source de vérité en SÈCHE : le
   * déficit kcal en est DÉRIVÉ à chaque pesée (`déficit = rate% × poids × 7700 / 7`),
   * donc il se recalibre tout seul à mesure qu'on s'allège — contrairement à un
   * déficit kcal figé. Zone recommandée 0,5–1,0 %/sem. `0` = maintien. Absent =
   * mode legacy piloté par `deficitKcal`.
   */
  lossRatePctPerWeek?: number;
  /**
   * Rythme de GAIN visé en PRISE DE MASSE, en % du poids corporel par semaine.
   * Symétrique de `lossRatePctPerWeek` : le SURPLUS en est dérivé à chaque pesée
   * (`surplus = rate% × poids × 7700 / 7` → `deficitKcal = -surplus`). Défaut lean bulk
   * ~0,25 %/sem (fourchette 0,10–0,50). Utilisé seulement quand `goalMode === 'bulk'`.
   */
  gainRatePctPerWeek?: number;
  /**
   * Garde anti-perte-trop-rapide. Si `false`, le coach ne REMONTE jamais la cible,
   * même si la perte dépasse le rythme visé (ou le seuil physiologique 1 %/sem) :
   * on assume une sèche plus agressive. Absent / `true` = garde active (défaut,
   * préserve le muscle en relevant la cible de +150 quand la perte s'emballe).
   * N'affecte que la correction de tendance (repli) et la garde ne touche jamais
   * le plancher de sécurité BMR, qui reste appliqué dans tous les cas.
   */
  slowdownGuardEnabled?: boolean;
  /**
   * Réglage AVANCÉ : autorise la cible à descendre sous le métabolisme de base (BMR).
   * Absent / `false` = plancher de sécurité BMR appliqué (défaut sûr, comportement
   * historique). `true` = plancher BMR retiré pour un utilisateur averti qui juge son
   * BMR estimé trop haut et veut pousser sa sèche — le plancher ABSOLU (1500 H / 1200 F)
   * reste appliqué quoi qu'il arrive (garde-fou non désactivable). Cf. minSafeKcal.
   */
  allowBelowBmr?: boolean;
  /**
   * Timestamp (ms) de la dernière correction de tendance auto-appliquée (±150 kcal).
   * Sert de garde anti-cumul : une correction relative ne s'applique qu'~1×/semaine.
   * La cible "maintenance mesurée" (absolue) n'est pas concernée par cette garde.
   */
  lastAutoAdjustAt?: number;
  /**
   * Offset de tendance cumulé (kcal) appliqué par-dessus la formule TDEE−déficit
   * quand la maintenance mesurée n'est pas disponible. Chaque correction
   * anti-stagnation l'incrémente de ±150 (cf. computeAdaptiveTarget). Défaut 0.
   */
  trendAdjustKcal?: number;
  /**
   * Facteur d'activité CALIBRÉ sur le métabolisme réel = maintenance mesurée / BMR,
   * mémorisé dès qu'une maintenance mesurée est disponible (clampé à [1.2, 2.2]).
   * Sert de repli personnalisé à la formule les jours sans assez de logs, au lieu du
   * facteur théorique générique. Absent tant qu'aucune mesure n'a eu lieu.
   */
  measuredActivityFactor?: number;
  /** Timestamp (ms) du dernier bilan hebdomadaire acquitté (« Vu »). Sert à n'afficher la carte qu'~1×/semaine. */
  lastWeeklyReviewAt?: number;
  /**
   * Début de la sèche continue en cours (ms). Posé automatiquement dès qu'un déficit
   * est actif (au 1er recalc en sèche) et effacé au passage en maintien / à l'atteinte
   * de l'objectif. Sert à recommander une pause diète (diet break) après 6-12 semaines
   * continues (cf. dietBreakStatus, Module 4.2). Absent tant qu'aucune sèche n'a débuté.
   */
  cutStartedAt?: number;
  /**
   * Facteur d'activité GELÉ au premier relevé de maintenance mesurée de la sèche en cours
   * (= maintenance mesurée / BMR à cet instant, clampé à [1.2, 2.2]). Sert de RÉFÉRENCE au
   * détecteur d'adaptation métabolique (pause diète) : `BMR_courant × cutBaselineFactor`
   * estime ce que serait la maintenance au poids actuel si le ratio d'activité n'avait pas
   * décroché. Contrairement à `measuredActivityFactor` (ré-étalonné à chaque pesée, donc qui
   * suivrait la mesure et rendrait la chute toujours ≈ 0), il est FIGÉ tôt dans la sèche.
   * Posé une seule fois, effacé au passage en maintien / prise / atteinte de l'objectif.
   */
  cutBaselineFactor?: number;
  /**
   * Début de la prise de masse continue en cours (ms). Symétrique de `cutStartedAt` :
   * posé automatiquement dès qu'un surplus est actif (`deficitKcal < 0`) et effacé au
   * passage en maintien / sèche / à l'atteinte de l'objectif. Sert à recommander un
   * mini-cut après ~10-12 semaines continues (cf. miniCutStatus). Absent tant qu'aucune
   * prise de masse n'a débuté.
   */
  bulkStartedAt?: number;
  /**
   * Timestamp (ms) où l'objectif de poids a été atteint et la cible automatiquement
   * basculée en maintien (déficit 0). Sert au message « objectif atteint » et évite
   * une re-bascule. Absent tant que l'objectif n'est pas atteint.
   */
  goalReachedAt?: number;
  /**
   * Ingrédients d'APPOINT (crème de riz pré-training, etc.) : aliments occasionnels qu'on
   * ajoute à sa diète avec un interrupteur « j'en ai / j'en ai pas ». Les disponibles sont
   * injectés dans leur créneau AVANT le calibrage macro, donc le plan se re-échelonne pour
   * tenir la cible (les jours sans, les autres aliments absorbent leurs calories). Cf.
   * AddonFood et lib/addons.
   */
  addonFoods?: AddonFood[];
  /** Timestamp (ms) de la dernière sauvegarde exportée. Sert au rappel bi-hebdo. */
  lastBackupAt?: number;
  /** Timestamp (ms) jusqu'auquel le rappel de sauvegarde est mis en veille ("Plus tard"). */
  backupSnoozeUntil?: number;
}
