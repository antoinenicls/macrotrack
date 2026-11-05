import { foodsRepo, profileRepo, settingsRepo } from './repositories';
import { SEED_FOODS, SEED_VERSION, DEPRECATED_FOOD_IDS } from '@/data/seedFoods';
import { SEED_PROFILE } from '@/data/seedProfile';
import { SEED_PLAN_TEMPLATE } from '@/data/seedPlan';
import { SEED_WEEKLY_ROTATION, ROTATION_VERSION, SEED_ROTATION_BASE_KCAL, scaleRotationToTargets } from '@/data/seedWeeklyRotation';
import { substituteRotationToAllowed } from '@/lib/foodSelection';
import { usableFoodIds, isExcluded } from '@/lib/diet';
import { applyFoodSwaps } from '@/lib/swap';
import { applyMealStructure } from '@/lib/mealStructure';
import { injectAddonFoods } from '@/lib/addons';
import type { AddonFood } from '@/types';

/**
 * Appoint livré par défaut : crème de riz Nutrimuscle en collation (créneau pré-training).
 * Deux parfums interchangeables, chocolat actif au départ ; l'utilisateur bascule en un tap.
 * OFF par défaut pour ne jamais modifier le plan sans action explicite de sa part.
 */
const CREME_DE_RIZ_ADDON: AddonFood = {
  id: 'creme-de-riz',
  foodId: 'creme-de-riz-chocolat',
  variants: [
    { foodId: 'creme-de-riz-chocolat', label: 'Chocolat' },
    { foodId: 'creme-de-riz-vanille',  label: 'Vanille' }
  ],
  slot: 'collation',
  grams: 40,
  cooked: false,
  available: false
};

/**
 * 1er lancement : précharge profil, plan type et base d'aliments.
 * Idempotent : ne ré-écrase pas un profil déjà existant.
 * Réinjecte les nouveaux aliments seed si SEED_VERSION a changé,
 * sans toucher aux aliments custom.
 */
export async function ensureSeeded(): Promise<void> {
  const existingProfile = await profileRepo.get();
  if (!existingProfile) {
    await profileRepo.put(SEED_PROFILE);
  }

  const existingSettings = await settingsRepo.get();
  if (!existingSettings) {
    await settingsRepo.put({
      id: 'app',
      theme: 'light',
      units: 'metric',
      lastSeedVersion: 0,
      planTemplate: SEED_PLAN_TEMPLATE,
      // Coach ACTIF dès le 1er lancement : sans ça, la cible reste figée à la
      // valeur seed et ne reflète jamais la tendance de poids réelle (= "pas de
      // vrai déficit"). Mini-sèche 400 kcal par défaut, cohérent avec la rotation.
      adaptiveTargets: true,
      goalMode: 'cut',
      deficitKcal: 400,
      // Aliments meal-prep : on les pèse typiquement après cuisson en lot.
      // On pré-règle le toggle d'entrée sur "cuit" pour éviter d'avoir à basculer à chaque fois.
      foodPrefs: {
        'poulet-blanc-cru':   { inputState: 'cooked' },
        'steak-hache-5-cru':  { inputState: 'cooked' },
        'riz-blanc-sec':      { inputState: 'cooked' },
        'riz-complet-sec':    { inputState: 'cooked' },
        'pates-completes-sec':{ inputState: 'cooked' },
        'pomme-de-terre-cru': { inputState: 'cooked' },
        'lentilles-seches':   { inputState: 'cooked' }
      }
    });
  }

  const currentSettings = (await settingsRepo.get())!;
  if (currentSettings.lastSeedVersion < SEED_VERSION) {
    const now = Date.now();
    // Réinjection du seed SANS écraser un aliment que l'utilisateur s'est approprié
    // (édité via FoodForm, qui pose `isCustom`). Sinon un bump de version effacerait
    // silencieusement ses corrections de macros, et la diète repartirait sur des
    // valeurs qu'il avait justement changées.
    const existingFoods = new Map((await foodsRepo.all()).map((f) => [f.id, f]));
    const toWrite = SEED_FOODS
      .filter((f) => !existingFoods.get(f.id)?.isCustom)
      .map((f) => ({ ...f, createdAt: existingFoods.get(f.id)?.createdAt ?? now }));
    await foodsRepo.bulkPut(toWrite);

    // Supprime les aliments retirés du seed (sauf si l'utilisateur les a personnalisés)
    for (const id of DEPRECATED_FOOD_IDS) {
      const existing = await foodsRepo.get(id);
      if (existing && !existing.isCustom) await foodsRepo.delete(id);
    }

    // v16 : renomme aussi la viande hachée quand l'utilisateur en a édité les macros
    // (aliment `isCustom`, donc épargné par la réinjection) mais a gardé l'ancien nom.
    const minced = existingFoods.get('steak-hache-5-cru');
    if (minced?.isCustom && minced.name === 'Steak haché 5% (cru)') {
      await foodsRepo.put({ ...minced, name: 'Viande hachée 5% (crue)' });
    }

    await settingsRepo.put({ ...currentSettings, lastSeedVersion: SEED_VERSION });
  }

  // Backfill foodPrefs : pour les users qui ont initialisé avant cette feature,
  // applique les préférences "cuit" sur les aliments meal-prep, sans écraser
  // d'éventuelles préférences déjà saisies par l'utilisateur.
  const MEAL_PREP_DEFAULTS: Record<string, 'cooked'> = {
    'poulet-blanc-cru':   'cooked',
    'steak-hache-5-cru':  'cooked',
    'riz-blanc-sec':      'cooked',
    'riz-complet-sec':    'cooked',
    'pates-completes-sec':'cooked',
    'pomme-de-terre-cru': 'cooked',
    'lentilles-seches':   'cooked'
  };
  const s = (await settingsRepo.get())!;
  const prefs = s.foodPrefs ?? {};
  let changed = false;
  for (const [id, state] of Object.entries(MEAL_PREP_DEFAULTS)) {
    if (!prefs[id]?.inputState) {
      prefs[id] = { ...prefs[id], inputState: state };
      changed = true;
    }
  }
  if (changed) await settingsRepo.put({ ...s, foodPrefs: prefs });

  // Backfill coach : les installs créées AVANT l'activation par défaut ont
  // `adaptiveTargets` non défini → le moteur de cible adaptative ne tournait jamais
  // et la cible restait gelée (déficit non réel). On l'allume une fois, sans écraser
  // un choix explicite (le seul état "off" possible aujourd'hui est `undefined`).
  // Lipides : l'ancien défaut 0,9 g/kg passe à 0,8 g/kg. À 0,9, en sèche sur une cible
  // basse, lipides + protéines + fruits occupaient presque toute la journée et les
  // féculents tombaient sous 50 g cuits par repas. 0,8 g/kg reste bien au-dessus du
  // plancher hormonal (0,5 g/kg / 20 % des kcal, cf. fatTargetG). Seule la valeur par
  // défaut exacte est migrée (aucun écran ne permet encore de la régler à la main).
  const pf = await profileRepo.get();
  if (pf && pf.fatPerKg === 0.9) {
    await profileRepo.put({ ...pf, fatPerKg: 0.8 });
  }

  const sc = (await settingsRepo.get())!;
  if (sc.adaptiveTargets === undefined) {
    await settingsRepo.put({
      ...sc,
      adaptiveTargets: true,
      deficitKcal: sc.deficitKcal ?? 400
    });
  }

  // Backfill direction : les installs créées AVANT l'ajout du mode « prise de masse »
  // n'ont pas de `goalMode`. On l'infère une fois du signe du rythme/déficit legacy
  // (déficit ou rythme de perte > 0 → sèche ; déficit < 0 → prise ; sinon maintien)
  // pour que l'app soit inchangée pour les sèches existantes.
  const sm = (await settingsRepo.get())!;
  if (sm.goalMode === undefined) {
    const inferred =
      ((sm.lossRatePctPerWeek ?? 0) > 0 || (sm.deficitKcal ?? 0) > 0)
        ? 'cut'
        : (sm.deficitKcal ?? 0) < 0
        ? 'bulk'
        : 'maintain';
    await settingsRepo.put({ ...sm, goalMode: inferred });
  }

  // Ingrédient d'appoint par défaut : la crème de riz Nutrimuscle (glucide rapide
  // pré-training), en collation, au parfum choisi par l'utilisateur. Enregistrée OFF
  // (`available: false`) : elle ne modifie le plan que le jour où il bascule « j'en ai »
  // dans le panneau dédié. On n'écrase jamais une liste d'appoints déjà présente.
  const sa = (await settingsRepo.get())!;
  if (sa.addonFoods === undefined) {
    await settingsRepo.put({ ...sa, addonFoods: [CREME_DE_RIZ_ADDON] });
  } else {
    // Migration v14 : l'ancienne entrée pointait sur la crème de riz GÉNÉRIQUE, désormais
    // retirée du seed. On la repointe sur les variantes Nutrimuscle en conservant le choix
    // « j'en ai / j'en ai pas » déjà fait. Les appoints antérieurs à la clé stable `id`
    // en reçoivent une (dérivée de leur aliment), sans être touchés autrement.
    let changed = false;
    const migrated = sa.addonFoods.map((a) => {
      if (a.foodId === 'creme-de-riz') {
        changed = true;
        return { ...CREME_DE_RIZ_ADDON, available: a.available };
      }
      if (!a.id) {
        changed = true;
        return { ...a, id: a.foodId };
      }
      return a;
    });
    if (changed) await settingsRepo.put({ ...sa, addonFoods: migrated });
  }

  // Rotation hebdomadaire : applique automatiquement si jamais configurée OU
  // si on a bumpé ROTATION_VERSION (rééquilibrage des macros, etc).
  // À chaque bump, la rotation est ré-appliquée pour rester à jour.
  const finalSettings = (await settingsRepo.get())!;
  const hasAnyWeekly = !!finalSettings.weeklyTemplates && Object.keys(finalSettings.weeklyTemplates).length > 0;
  const lastRotation = finalSettings.lastRotationVersion ?? 0;
  if (!hasAnyWeekly || lastRotation < ROTATION_VERSION) {
    // Calibre la rotation sur les cibles courantes en "protéines-fixes" :
    // protéines calées sur la cible (2,2 g/kg), glucides/lipides ajustés au kcal.
    const profile = await profileRepo.get();
    const targetKcal = profile?.targetKcal ?? SEED_ROTATION_BASE_KCAL;
    const targetProteinG = profile?.targetProteinG
      ?? Math.round((profile?.proteinPerKg ?? 2.2) * (profile?.weightKg ?? 85));
    const targetFatG = profile?.targetFatG
      ?? Math.round((profile?.fatPerKg ?? 0.9) * (profile?.weightKg ?? 85));
    // La rotation curée passe par la SÉLECTION d'aliments de l'utilisateur avant d'être
    // calibrée : sans ça, un bump de version lui réimposerait les aliments qu'il a
    // décochés. Le résolveur voit aussi ses aliments perso (sinon ils compteraient 0).
    const foods = await foodsRepo.all();
    const byId = new Map(foods.map((f) => [f.id, f]));
    const resolve = (id: string) => byId.get(id);
    const allowed = usableFoodIds(finalSettings.selectedFoodIds, finalSettings.excludedTags, foods);
    const rotation = substituteRotationToAllowed(
      SEED_WEEKLY_ROTATION, allowed, resolve,
      (f) => isExcluded(f, finalSettings.excludedTags)
    );
    // Les remplacements durables décidés depuis le menu survivent au bump de version.
    const swapped = applyFoodSwaps(rotation, finalSettings.foodSwaps, resolve);
    // Ingrédients d'appoint disponibles injectés avant le scaling (cf. lib/addons).
    const withAddons = injectAddonFoods(
      swapped, finalSettings.addonFoods,
      (id) => isExcluded(resolve(id), finalSettings.excludedTags)
    );
    const scaled = applyMealStructure(
      scaleRotationToTargets(withAddons, targetKcal, targetProteinG, targetFatG, resolve),
      finalSettings.activeSlots
    );
    await settingsRepo.put({
      ...finalSettings,
      weeklyTemplates: scaled,
      // Reset volontaire du plan : on purge les plans figés par date pour que la
      // nouvelle rotation (ici sans cannelle/cacao) s'applique aussi au jour courant.
      planSnapshots: {},
      lastRotationVersion: ROTATION_VERSION
    });
  }
}

/** Réinitialise toutes les données (utilisé par le bouton "Reset"). */
export async function wipeAll(): Promise<void> {
  const { getDB } = await import('./db');
  const db = await getDB();
  const stores = ['profile', 'settings', 'foods', 'combos', 'meals', 'weights', 'measurements', 'photos'] as const;
  for (const s of stores) await db.clear(s);
  await ensureSeeded();
}
