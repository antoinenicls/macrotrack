import type { ReactNode } from 'react';
import {
  Rocket, Compass, Smartphone, ListChecks, Repeat, UtensilsCrossed, Dumbbell, LineChart, ShoppingCart,
  Apple, Ban, Clock, Utensils, ClipboardCheck, CookingPot, Thermometer, Flame, Activity, Target, Beef,
  Droplet, Sparkles, BadgeCheck, Scale, CalendarCheck, ShieldCheck, SlidersHorizontal, Coffee, HeartPulse,
  CalendarHeart, TrendingUp, BookMarked, type LucideIcon
} from 'lucide-react';
import type { AppSettings, Food, GoalMode, Meal, Profile, WeightEntry } from '@/types';
import { ACTIVITY_FACTORS, ACTIVITY_LABEL } from '@/types';
import {
  bmr, tdee, effectiveTargets, minSafeKcal, muscleSafeFloorKcal, maxDeficitFraction, fatTargetG,
  recommendedRateRange, recommendedGainRange
} from '@/lib/nutrition';
import {
  estimateMaintenance, computeAdaptiveTarget, refeedGuidance, dietBreakStatus, referenceTdeeForDrop,
  recoveryStatus, MAINTENANCE_WINDOW_DAYS, MAINTENANCE_HALF_LIFE_DAYS
} from '@/lib/coach';
import { adjustmentHint, RATE_TOLERANCE, trendStats, smoothedCurrentKg } from '@/lib/trend';
import { carrySettingsOf } from '@/lib/estimateRebalance';
import { DEFAULT_SESSIONS_PER_WEEK } from '@/lib/trainingDay';
import { fmtKcal, fmtDelta, fmtKg } from '@/lib/format';
import { GoalSimulator } from './GoalSimulator';
import { B, Bullets, Callout, Formula, Note, OptionRow, Steps, TabRow, Term, Where } from './guideUi';

/** ~7700 kcal stockées par kg de masse corporelle (idem coach). */
const KCAL_PER_KG = 7700;

export type GroupId = 'start' | 'daily' | 'plan' | 'calories' | 'coach' | 'phases' | 'lexique';

/** Thèmes de l'onglet, dans l'ordre d'affichage. */
export const GROUPS: { id: GroupId; label: string; short: string; icon: LucideIcon }[] = [
  { id: 'start',    label: 'Bien démarrer',      short: 'Démarrer',        icon: Rocket },
  { id: 'daily',    label: 'Au quotidien',       short: 'Au quotidien',    icon: ListChecks },
  { id: 'plan',     label: 'Ton plan et tes aliments', short: 'Plan & aliments', icon: Apple },
  { id: 'calories', label: 'Comment tes calories sont calculées', short: 'Calories', icon: Flame },
  { id: 'coach',    label: 'Le coach automatique', short: 'Coach',         icon: Sparkles },
  { id: 'phases',   label: 'Phases et sécurité', short: 'Phases & sécurité', icon: ShieldCheck },
  { id: 'lexique',  label: 'Lexique',            short: 'Lexique',         icon: BookMarked }
];

export interface GuideEntry {
  id: string;
  group: GroupId;
  icon: LucideIcon;
  title: string;
  /** Une phrase : ce que la section explique. Visible repliée, et cherchable. */
  summary: string;
  /** Mots-clés de recherche en plus du titre et du résumé (synonymes, termes du corps). */
  keywords: string;
  body: ReactNode;
}

/** Tous les chiffres de l'utilisateur dont les sections ont besoin, calculés une fois. */
export function computeGuideContext(
  profile: Profile, settings: AppSettings, weights: WeightEntry[], allMeals: Meal[],
  byId: (id: string) => Food | undefined
) {
  const usesKatch = typeof profile.bodyFatPct === 'number' && profile.bodyFatPct > 0 && profile.bodyFatPct < 60;
  const leanMass = profile.bodyFatPct != null ? profile.weightKg * (1 - profile.bodyFatPct / 100) : null;
  const restingBmr = Math.round(bmr(profile));
  const factor = ACTIVITY_FACTORS[profile.activity];
  const maintenance = Math.round(tdee(profile));
  const targets = effectiveTargets(profile);
  const macros = { protein: targets.protein, fat: targets.fat, carbs: targets.carbs };

  const deficit = settings.deficitKcal ?? 400;
  const offset = settings.trendAdjustKcal ?? 0;
  const mode: GoalMode = settings.goalMode ?? (deficit > 0 ? 'cut' : deficit < 0 ? 'bulk' : 'maintain');
  const isBulk = mode === 'bulk';
  const targetLoss = (deficit * 7) / KCAL_PER_KG;
  const est = estimateMaintenance(allMeals, byId, weights, MAINTENANCE_WINDOW_DAYS);
  const allowBelowBmr = settings.allowBelowBmr ?? false;
  const reco = computeAdaptiveTarget(
    profile, deficit, offset, allMeals, byId, weights,
    settings.measuredActivityFactor, settings.slowdownGuardEnabled ?? true, mode, allowBelowBmr
  );
  const hint = adjustmentHint(weights, targetLoss, mode);

  const rateBand = recommendedRateRange(profile);
  const gainBand = recommendedGainRange(profile);
  const level = (l: string) => (l === 'high' ? 'élevé' : l === 'low' ? 'bas' : 'modéré');
  const currentProtein = profile.targetProteinG ?? macros.protein;
  const refeed = refeedGuidance(profile, est.ok ? est.tdee : maintenance, currentProtein, deficit);
  const dietBreak = dietBreakStatus({
    cutStartedAt: deficit > 0 ? settings.cutStartedAt : undefined,
    measuredTdee: est.ok ? est.tdee : null,
    // Référence calibrée sur le facteur d'activité gelé en début de sèche (pas la formule
    // générique, qui surestimerait et fabriquerait une fausse « chute métabolique »).
    formulaTdee: referenceTdeeForDrop(profile, settings.cutBaselineFactor)
  });
  const recovery = recoveryStatus({ recoveryStartedAt: settings.recoveryStartedAt });

  // Plancher lipidique hormonal : la plus contraignante de 0,5 g/kg et 20 % des kcal.
  const fatFloorPerKg = Math.round(0.5 * profile.weightKg);
  const fatFloorPct = Math.round((0.2 * targets.kcal) / 9);

  return {
    profile, settings, usesKatch, leanMass, restingBmr, factor, maintenance, targets, macros,
    deficit, offset, isBulk, targetLoss, est, allowBelowBmr, reco, hint,
    rateBand, rateBandLevel: level(rateBand.level), gainBand, gainBandLevel: level(gainBand.level),
    refeed, dietBreak, recovery,
    fatFloorPerKg, fatFloorPct, fatFloor: Math.max(fatFloorPerKg, fatFloorPct), fatApplied: fatTargetG(profile, targets.kcal),
    trend: trendStats(weights), smoothed: smoothedCurrentKg(weights),
    absoluteFloor: profile.sex === 'M' ? 1500 : 1200,
    carry: carrySettingsOf(settings),
    neededLogDays: Math.ceil(MAINTENANCE_WINDOW_DAYS * 0.6),
    paused: !!settings.dietPaused
  };
}

export type GuideContext = ReturnType<typeof computeGuideContext>;

const pct = (n: number) => n.toFixed(2).replace('.', ',');

/** Toutes les sections de l'onglet, alimentées par les chiffres de l'utilisateur. */
export function buildGuide(c: GuideContext): GuideEntry[] {
  const { profile, isBulk, deficit, maintenance, restingBmr, macros, targets, leanMass, usesKatch } = c;
  const proteinPerKgLbm = leanMass ? macros.protein / leanMass : null;

  return [
    /* ------------------------------------------------------------ Bien démarrer */
    {
      id: 'bienvenue', group: 'start', icon: Rocket,
      title: 'Comment marche l\'app',
      summary: 'Ton seul travail : te peser et cocher ce que tu manges. L\'app fait le reste.',
      keywords: 'debut commencer principe fonctionnement boucle quotidienne premiers pas',
      body: (
        <>
          <p>
            MacroTrack <B>planifie ta diète et l'ajuste toute seule</B>. Tu n'as aucun calcul à faire.
          </p>
          <Callout tone="brand" title="Ta journée en 3 gestes">
            <Steps items={[
              <>Le matin, à jeun, note ta <B>pesée</B> (carte « Pesée du matin » de l'Accueil, ou onglet Poids).</>,
              <>L'<B>Accueil</B> t'affiche ta cible du jour, ton menu et ce qu'il reste à manger.</>,
              <>Dans <B>Repas</B>, coche les aliments à mesure que tu les manges : les anneaux se remplissent.</>
            ]} />
          </Callout>
          <Note>
            Au fil des pesées, le coach recale ta cible pour que tu avances au bon rythme. Ses
            décisions s'appliquent seules à ton menu : tu n'as rien à recopier.
          </Note>
        </>
      )
    },
    {
      id: 'onglets', group: 'start', icon: Compass,
      title: 'Où trouver quoi',
      summary: 'Les 5 onglets du bas et les 4 rubriques de l\'onglet Plan.',
      keywords: 'onglets navigation menu accueil repas poids plan explications rubriques',
      body: (
        <>
          <div className="space-y-3">
            <TabRow emoji="🏠" name="Accueil">
              Calories du jour et anneaux de macros, pesée du matin, menu du jour, séance du jour,
              jour de recharge quand il est conseillé, bilan de la semaine et conseils du coach.
            </TabRow>
            <TabRow emoji="🍽️" name="Repas">
              Ton menu du jour à cocher, la recherche d'aliments, « Estimer ce repas » pour un repas
              non pesé, et la vue semaine avec la liste de courses.
            </TabRow>
            <TabRow emoji="📈" name="Poids">
              Tes pesées (poids, et % de masse grasse en option), les courbes de tendance,
              l'historique et ton objectif de poids avec sa date d'atteinte estimée.
            </TabRow>
            <TabRow emoji="👤" name="Plan">
              Ta configuration, rangée en 4 rubriques (voir ci-dessous).
            </TabRow>
            <TabRow emoji="📖" name="Explications">
              Cette page. Cherche un mot dans la barre du haut ou filtre par thème.
            </TabRow>
          </div>
          <Callout title="Les 4 rubriques de l'onglet Plan">
            <p><B>Objectif</B> : ton profil (âge, taille, activité, suivi du %MG) et ton objectif (sèche, maintien, prise de masse, rythme, pause diète).</p>
            <p><B>Aliments</B> : repas de la journée, régime et allergies, mes aliments, ingrédients d'appoint.</p>
            <p><B>Semaine</B> : tes 7 menus et le bilan de ce qu'ils couvrent.</p>
            <p><B>Réglages</B> : garde-fous de la cible, repas mangés dehors, sauvegarde et données.</p>
          </Callout>
        </>
      )
    },
    {
      id: 'donnees', group: 'start', icon: Smartphone,
      title: 'Tes données et la sauvegarde',
      summary: 'Tout reste sur ton téléphone : exporte une sauvegarde de temps en temps.',
      keywords: 'sauvegarde backup exporter importer reset reinitialiser changer de telephone iphone fichier hors-ligne offline installer ecran accueil confidentialite vie privee',
      body: (
        <>
          <p>
            Tes données restent <B>sur ton téléphone</B> : rien n'est envoyé sur un serveur et l'app
            marche <B>hors connexion</B> une fois installée. Ton compte sert seulement à protéger l'accès.
          </p>
          <Callout emoji="💾" title="Sauvegarde (important)">
            <p>
              « Exporter » enregistre un fichier avec toutes tes données. Garde-le <B>avant un reset
              ou un changement de téléphone</B> ; « Importer » le restaure. L'Accueil te le rappelle
              tous les 14 jours environ.
            </p>
            <Where>Plan → Réglages → Sauvegarde et données</Where>
          </Callout>
          <Note>
            Ajoute l'app à ton <B>écran d'accueil</B> (Safari : Partager → Sur l'écran d'accueil)
            pour l'ouvrir en plein écran, comme une vraie application.
          </Note>
        </>
      )
    },

    /* ------------------------------------------------------------ Au quotidien */
    {
      id: 'cocher', group: 'daily', icon: ListChecks,
      title: 'Cocher tes repas',
      summary: 'Cocher le menu, noter une portion entamée ou dépassée, ajouter un aliment libre.',
      keywords: 'logger log saisir cocher valider portion moitie entame depasse plus que prevu ajouter aliment recherche jours passes modifier futur',
      body: (
        <>
          <Where>Onglet Repas</Where>
          <Bullets items={[
            <><B>Cocher ton menu</B> : l'app a prévu tes repas et les portions, tu coches au fur et à mesure.</>,
            <><B>Portion partielle</B> : tu peux noter la quantité déjà mangée (par exemple la moitié), le reste reste à manger.</>,
            <><B>Portion dépassée</B> : si tu as mangé plus que prévu, la ligne passe en ambre et affiche ta vraie quantité, le prévu et l'écart.</>,
            <><B>Aliment hors menu</B> : ajoute-le via la recherche, choisis la quantité et s'il est pesé cru ou cuit (l'app convertit).</>
          ]} />
          <Note>
            <B>Aujourd'hui</B> se modifie librement. Les jours passés sont en lecture seule (le bouton
            « Voulez-vous faire une modification ? » les déverrouille) ; les jours à venir affichent le
            menu prévu.
          </Note>
        </>
      )
    },
    {
      id: 'remplacer', group: 'daily', icon: Repeat,
      title: 'Remplacer un aliment du menu',
      summary: 'Le bouton ↻ propose des équivalents, juste pour aujourd\'hui ou pour toujours.',
      keywords: 'swap echanger alternative changer remplacer pas envie substituer equivalent',
      body: (
        <>
          <p>
            Le bouton <B>↻</B> à côté d'un aliment du menu propose des alternatives du même type,
            avec la quantité déjà calculée pour ne pas dérégler ta journée.
          </p>
          <Bullets items={[
            <><B>Juste aujourd'hui</B> : le menu d'origine revient demain.</>,
            <><B>Toujours, dans toute ma rotation</B> : l'échange vaut pour toute ta semaine et survit aux recalculs du coach.</>
          ]} />
          <Note>
            Ce qui est conservé dépend du type : les protéines gardent leurs protéines, les féculents
            leurs calories, les légumes leur volume. Si aucune alternative n'apparaît, ajoute un aliment
            du même type dans Plan → Aliments → Mes aliments.
          </Note>
        </>
      )
    },
    {
      id: 'dehors', group: 'daily', icon: UtensilsCrossed,
      title: 'Repas mangé dehors (non pesé)',
      summary: 'Estimer un resto ou le plat d\'un proche : le reste de ta journée se recale.',
      keywords: 'restaurant resto fast-food fastfood pizza kebab tacos sushis burger estimation estimer exterieur dehors report surplus compensation proche famille alcool dessert supplements taille portion',
      body: (
        <>
          <Where>Repas → en bas de chaque repas : « Estimer ce repas (non pesé) »</Where>
          <Callout title="Deux façons d'estimer">
            <p><B>Rapide</B> : choisis le plat le plus proche (pizza, kebab, sushis, poke, croissant…), sa taille (de Petite à XXL) et les suppléments (boisson, alcool, pain, frites, sauce, dessert…).</p>
            <p><B>À la main</B> : compose ton assiette en portions (paume, poignée, pouce).</p>
          </Callout>
          <Callout title="Ce qui se passe ensuite">
            <p>
              Les repas pas encore entamés se <B>recalent</B> pour garder ta journée sur sa cible, en
              jouant seulement sur les féculents et le gras :
            </p>
            <p>• Tu as mangé <B>plus</B> que prévu : ils baissent, jamais sous 60 % de leur portion.</p>
            <p>• Tu as mangé <B>moins</B> : ils remontent de la moitié de l'écart (20 % de plus au maximum).</p>
            <p>• Les <B>protéines ne bougent pas</B>. Un message te prévient si le repas estimé en apportait moins que prévu.</p>
          </Callout>
          <Callout title="Le report sur les jours suivants" tone={c.carry.enabled ? 'brand' : 'neutral'}>
            {c.carry.enabled ? (
              <p>
                Chez toi : ce que la journée ne peut pas absorber (à partir de <B>{c.carry.minKcal} kcal</B>)
                est retiré des féculents et du gras des <B>{c.carry.days} jour{c.carry.days > 1 ? 's' : ''} suivant{c.carry.days > 1 ? 's' : ''}</B>,
                sans jamais retirer plus de <B>{Math.round(c.carry.maxShare * 100)} %</B> d'une journée.
                Le menu, la cible de l'Accueil et la liste de courses en tiennent compte.
              </p>
            ) : (
              <p>Chez toi, le report est <B>désactivé</B> : le surplus reste sur sa journée.</p>
            )}
            <Where>Plan → Réglages → Repas mangés dehors</Where>
          </Callout>
          <Note>
            Modifier ou supprimer l'estimation met tout à jour. Le coach compte ces repas, mais si plus
            de 40 % de tes calories sur la période sont estimées, il suspend la mesure de ta maintenance
            (voir « Le coach mesure ton vrai métabolisme »).
          </Note>
        </>
      )
    },
    {
      id: 'seance', group: 'daily', icon: Dumbbell,
      title: 'Jour de séance',
      summary: 'Déclare ta séance le jour même : collation pré-training, reste du menu recalé.',
      keywords: 'seance entrainement sport muscu musculation training pre-training pre workout galettes riz miel banane collation',
      body: (
        <>
          <Where>Accueil → carte « Séance aujourd'hui ? » → Oui</Where>
          <p>
            Tes jours d'entraînement ne sont pas fixes : tu déclares la séance le jour même. Ta
            collation devient le <B>bloc pré-training</B> : 4 galettes de riz (30 g), 1 banane (110 g)
            et du miel (14 g), des glucides rapides et digestes.
          </p>
          <Bullets items={[
            <>Fromage blanc, whey et oléagineux de la collation sont <B>gardés</B> (à manger après la séance) ; seuls les fruits et appoints glucidiques sortent.</>,
            <>Les calories du bloc sont reprises sur les <B>féculents et matières grasses</B> du reste de la journée, tous du même pourcentage, chacun gardant au moins 60 % de sa portion. Les protéines ne bougent pas.</>,
            <>Si ce plancher ne suffit pas, la journée dépasse un peu sa cible plutôt que de te servir 5 g de riz.</>
          ]} />
          <Note>
            Annulable, valable pour aujourd'hui seulement, et cumulable avec un jour de recharge. Pour
            la liste de courses, règle « Séances prévues » (par défaut {DEFAULT_SESSIONS_PER_WEEK} par
            semaine) : l'app y ajoute le bloc pour les séances restantes.
          </Note>
        </>
      )
    },
    {
      id: 'pesee', group: 'daily', icon: LineChart,
      title: 'Te peser et lire ta tendance',
      summary: 'Pesée du matin, moyenne sur 7 jours et pente sur 3 semaines.',
      keywords: 'peser pesee balance poids matin jeun tendance moyenne mobile courbe graphique masse grasse impedance objectif de poids date atteinte projection',
      body: (
        <>
          <p>
            Pèse-toi le <B>matin, à jeun, après être passé aux toilettes</B>. La régularité compte plus
            que l'heure exacte. Le % de masse grasse est optionnel (balance à impédance).
          </p>
          <p>
            Ton poids <B>saute d'un jour à l'autre</B> (eau, sel, glucides, transit) : ce n'est pas du
            gras. L'app ne se fie jamais à une pesée isolée :
          </p>
          <Formula>{`Moyenne mobile = moyenne des 7 derniers jours
Tendance (kg/sem) = pente de la droite ajustée
                    sur tes pesées des 21 derniers jours`}</Formula>
          <Callout tone={c.trend.weeklyKgPerWeek != null ? 'brand' : 'neutral'} title="Chez toi">
            {c.trend.weeklyKgPerWeek != null
              ? <p>Tendance actuelle : <B>{fmtDelta(c.trend.weeklyKgPerWeek)}/sem</B>{c.smoothed != null && <> · poids lissé ≈ <B>{fmtKg(c.smoothed)}</B></>}.</p>
              : <p>Continue à te peser quelques jours pour débloquer ta tendance.</p>}
          </Callout>
          <Note>
            C'est cette tendance, et non la pesée du jour, qui pilote le coach. Le %MG est lui aussi
            lissé sur 7 jours avant de servir aux calculs : une mesure d'impédance isolée ne fait pas
            bouger tes cibles. Dans l'onglet Poids, glisser le doigt sur une courbe déplace le curseur
            au même jour sur l'autre.
          </Note>
          {profile.goalWeightKg != null && (
            <Note>
              <span aria-hidden>🎯 </span>Objectif de poids : <B>{fmtKg(profile.goalWeightKg)}</B>. Dès que
              ta tendance lissée l'atteint, l'app passe <B>toute seule en maintien</B> et te le dit.
            </Note>
          )}
        </>
      )
    },
    {
      id: 'courses', group: 'daily', icon: ShoppingCart,
      title: 'Vue semaine et liste de courses',
      summary: 'Les 7 prochains jours et une liste rangée par rayon, sans ce que tu as déjà.',
      keywords: 'courses supermarche acheter rayon panier stock maison garde-manger semaine prochaine liste',
      body: (
        <>
          <Where>Repas → « Vue semaine & liste de courses »</Where>
          <Bullets items={[
            <>Choisis <B>Cette semaine</B> ou <B>Semaine prochaine</B>.</>,
            <>La liste est rangée <B>par rayon</B>, avec des quantités d'achat concrètes (« 9 bananes », « 2 boîtes », « 1,1 kg »).</>,
            <>Touche une ligne pour la mettre <B>dans le panier</B>.</>,
            <>L'icône colis la marque <B>déjà à la maison</B> : elle est déduite et ne revient pas.</>,
            <><B>Séances prévues</B> ajoute galettes, miel et bananes pour les séances de la semaine pas encore déclarées.</>
          ]} />
        </>
      )
    },

    /* ------------------------------------------------------------ Plan & aliments */
    {
      id: 'mes-aliments', group: 'plan', icon: Apple,
      title: 'Choisir tes aliments',
      summary: 'Coche ce que tu acceptes de manger ; ajoute ou modifie tes propres aliments.',
      keywords: 'selection mes aliments cocher decocher base recommandee ajouter creer aliment perso personnel modifier supprimer categorie role remplacement',
      body: (
        <>
          <Where>Plan → Aliments → Mes aliments</Where>
          <p>
            L'app compose ton plan <B>uniquement avec les aliments cochés</B>. Un aliment de la rotation
            que tu n'as pas retenu est remplacé par un autre du <B>même rôle</B> (un féculent par un
            féculent…), aux macros les plus proches.
          </p>
          <Callout emoji="➕" title="Ajouter tes propres aliments">
            <p>
              Le bouton « Ajouter » d'une catégorie pré-remplit le bon <B>type</B> : c'est lui, pas le nom,
              qui décide comment l'aliment est utilisé. Ton aliment est aussitôt coché et loggable. Il entre
              dans le menu automatique en remplaçant un aliment du même type que tu as décoché.
            </p>
          </Callout>
          <Note>
            Il faut garder au moins un aliment par catégorie essentielle. Les aliments d'origine sont
            modifiables mais pas supprimables (le plan s'appuie dessus) ; les tiens le sont.
          </Note>
        </>
      )
    },
    {
      id: 'regime', group: 'plan', icon: Ban,
      title: 'Régime et allergies',
      summary: 'Végétarien, sans gluten… : ce qui est exclu ne revient jamais dans ton menu.',
      keywords: 'vegetarien vegetalien vegan pescetarien allergie intolerance gluten lactose lait produits laitiers oeuf arachide cacahuete fruits a coque noix viande poisson exclusion exclure',
      body: (
        <>
          <Where>Plan → Aliments → Régime et allergies</Where>
          <p>
            À ne pas confondre avec « Mes aliments ». Décocher un aliment veut dire <B>pas envie</B> :
            l'app peut t'en proposer un autre du même type. Une exclusion veut dire <B>je ne peux
            pas</B> : plus rien ne la contourne, ni remplacement automatique, ni suggestion.
          </p>
          <Note>
            Une exclusion qui viderait une catégorie essentielle est refusée. Tes aliments perso doivent
            déclarer leur composition (viande, lait, gluten…) pour être écartés correctement. Un profil
            végétalien laisse un trou en B12 : seul un supplément le comble.
          </Note>
        </>
      )
    },
    {
      id: 'nb-repas', group: 'plan', icon: Clock,
      title: 'Nombre de repas par jour',
      summary: '4, 3, 2 repas ou jeûne 16/8 : mêmes calories, réparties autrement.',
      keywords: 'jeune intermittent 16/8 petit-dejeuner sauter collation structure repas de la journee deux trois quatre',
      body: (
        <>
          <Where>Plan → Aliments → Repas de la journée</Where>
          <p>
            Retirer un repas ne retire pas ses aliments : ils sont reversés dans le repas actif le plus
            proche. Ta journée garde <B>exactement</B> les mêmes calories et les mêmes macros.
          </p>
          <Note>
            Sauter le petit-déjeuner ne fait pas maigrir plus vite : ça concentre les repas et grossit
            les portions. Si un repas te paraît trop gros, remets-en un.
          </Note>
        </>
      )
    },
    {
      id: 'appoint', group: 'plan', icon: Utensils,
      title: 'Ingrédients d\'appoint',
      summary: '« J\'en ai / j\'en ai pas » : un aliment occasionnel qui entre ou sort du plan.',
      keywords: 'appoint creme de riz nutrimuscle parfum chocolat vanille occasionnel interrupteur stock',
      body: (
        <>
          <Where>Plan → Aliments → Ingrédients d'appoint</Where>
          <p>
            Pour un aliment que tu n'as pas toujours (la crème de riz, par exemple). Active l'interrupteur
            quand tu en as : il rejoint son repas et le reste des portions s'ajuste pour tenir ta cible.
            Désactive-le sinon : il sort du plan et les autres aliments reprennent ses calories.
          </p>
          <Note>
            Quand il existe plusieurs parfums, choisis-en un : une seule variante entre dans le plan.
            Un ingrédient d'appoint n'est jamais remplacé automatiquement par un autre aliment.
          </Note>
        </>
      )
    },
    {
      id: 'couverture', group: 'plan', icon: ClipboardCheck,
      title: 'Ce que ta semaine couvre',
      summary: 'Bilan micronutriments, protéines par repas et cible atteignable ou non.',
      keywords: 'couverture micronutriments vitamines omega-3 fer b12 vitamine d proteines par repas repartition synthese musculaire mps bilan qualite suggestions',
      body: (
        <>
          <Where>Plan → Semaine → Ce que ta semaine couvre</Where>
          <p>
            Changer d'aliments peut garder des macros parfaites et appauvrir la diète : remplacer les
            sardines par du poulet garde tes calories et tes protéines, mais fait disparaître les
            <B> oméga-3</B>. Ce bilan regarde ta semaine telle qu'elle est construite :
          </p>
          <Bullets items={[
            <><B>Micronutriments</B> : les sources qui ont disparu, avec l'aliment à cocher en un tap pour combler le trou.</>,
            <><B>Protéines par repas</B> : chaque repas principal devrait apporter ~{Math.round(0.4 * profile.weightKg)} g (≈ 0,4 g/kg), la dose qui stimule le mieux la construction musculaire. Mieux vaut répartir que tout concentrer sur un repas.</>,
            <><B>Cible atteignable</B> : il te prévient si tes aliments ne permettent pas d'atteindre ta cible de protéines.</>
          ]} />
          <Note>
            C'est un signal d'alerte, pas un calcul d'apports exact. Pour ce qu'aucun aliment ne couvre
            (B12 en diète 100 % végétale, vitamine D en hiver), il faut un supplément.
          </Note>
        </>
      )
    },
    {
      id: 'adaptation', group: 'plan', icon: CookingPot,
      title: 'Le plan s\'adapte à ta cible',
      summary: 'Protéines et lipides tenus, légumes figés : ce sont les féculents qui bougent.',
      keywords: 'portions recalcul recalibrage feculents changement demain journee entamee reecrite plan semaine rotation',
      body: (
        <>
          <p>
            Quand ta cible change, l'app ne multiplie pas tout bêtement. Elle vise <B>pile tes calories,
            protéines et lipides</B>, et garde tes <B>légumes et fruits figés</B> (fibres, vitamines,
            satiété). Ce sont surtout les <B>féculents</B> qui absorbent la variation.
          </p>
          <Callout tone="brand" emoji="🔒" title="Une journée entamée n'est jamais réécrite">
            <p>Un ajustement qui tombe en cours de journée s'applique à partir de demain : ce que tu as déjà coché ne bouge pas.</p>
          </Callout>
          <Note>Tes 7 menus se voient dans Plan → Semaine. Ils se répètent chaque semaine.</Note>
        </>
      )
    },
    {
      id: 'cru-cuit', group: 'plan', icon: Thermometer,
      title: 'Cru ou cuit',
      summary: 'Pèse comme tu veux : l\'app convertit pour que les calories restent justes.',
      keywords: 'cru cuit cuisson poids sec riz pates viande conversion facteur',
      body: (
        <p>
          Chaque aliment est enregistré dans un état précis (cru, sec ou cuit). Si tu pèses dans l'autre
          état, l'app convertit avec un facteur de cuisson (riz ×2,5, viande ×0,7…). Le menu affiche
          l'équivalent cru à côté du poids cuit.
        </p>
      )
    },

    /* ------------------------------------------------------------ Calories */
    {
      id: 'bmr', group: 'calories', icon: Flame,
      title: 'Métabolisme de base (BMR)',
      summary: `L'énergie brûlée au repos complet. Chez toi : ${fmtKcal(restingBmr)}.`,
      keywords: 'bmr metabolisme de base repos katch-mcardle mifflin st jeor formule masse maigre',
      body: (
        <>
          <p>C'est l'énergie que ton corps brûle au repos complet, sans bouger. Tout part de là.</p>
          {usesKatch && leanMass != null ? (
            <>
              <p>
                Comme tu suis ton <B>% de masse grasse</B> ({profile.bodyFatPct} %), l'app utilise la
                formule <B>Katch-McArdle</B>, plus précise car basée sur ta masse maigre.
              </p>
              <Formula>{`masse maigre = ${profile.weightKg} kg × (1 − ${profile.bodyFatPct}/100) = ${leanMass.toFixed(1)} kg
BMR = 370 + 21,6 × ${leanMass.toFixed(1)} = ${restingBmr} kcal`}</Formula>
            </>
          ) : (
            <>
              <p>Sans % de masse grasse, l'app utilise la formule de référence <B>Mifflin-St Jeor</B>.</p>
              <Formula>{`BMR = 10 × ${profile.weightKg} + 6,25 × ${profile.heightCm} − 5 × ${profile.ageYears} ${profile.sex === 'M' ? '+ 5' : '− 161'} = ${restingBmr} kcal`}</Formula>
              <Note>Active le suivi du %MG (Plan → Objectif → Mon profil) pour passer à Katch-McArdle, plus fidèle.</Note>
            </>
          )}
        </>
      )
    },
    {
      id: 'maintenance', group: 'calories', icon: Activity,
      title: 'Maintenance (TDEE)',
      summary: `Tout ce que tu dépenses sur une journée. Chez toi : ${fmtKcal(maintenance)}.`,
      keywords: 'tdee maintenance depense journaliere facteur activite niveau sedentaire actif',
      body: (
        <>
          <p>
            La maintenance, c'est ta dépense sur une journée entière (BMR + activité). L'app multiplie le
            BMR par un <B>facteur d'activité</B>.
          </p>
          <Formula>{`Maintenance = BMR × facteur
${restingBmr} × ${c.factor} (${ACTIVITY_LABEL[profile.activity]}) = ${maintenance} kcal`}</Formula>
          <Note>
            Manger à la maintenance = poids stable ; en dessous, tu perds ; au-dessus, tu prends. Dès
            que le coach a mesuré ta vraie maintenance, il remplace cette formule (voir « Le coach mesure
            ton vrai métabolisme »).
          </Note>
        </>
      )
    },
    {
      id: 'cible', group: 'calories', icon: Target,
      title: 'Objectif et cible calorique',
      summary: 'Sèche, maintien ou prise : la cible découle du rythme visé. Avec un simulateur.',
      keywords: 'objectif cible calories deficit surplus seche maintien prise de masse rythme pourcentage par semaine simulateur kg par semaine',
      body: (
        <>
          <Where>Plan → Objectif → Mon objectif</Where>
          <p>
            Tu choisis un <B>rythme</B> en % de ton poids par semaine. L'app en déduit le {isBulk ? 'surplus' : 'déficit'} :
          </p>
          {isBulk ? (
            <Formula>{`Surplus = rythme % × poids × 7700 / 7
Cible = ${maintenance} + ${-deficit} = ${maintenance - deficit} kcal/j
Rythme ≈ +${Math.abs(c.targetLoss).toFixed(2)} kg/sem`}</Formula>
          ) : (
            <Formula>{`Déficit = rythme % × poids × 7700 / 7
Cible = ${maintenance} − ${deficit} = ${maintenance - deficit} kcal/j
Rythme ≈ ${c.targetLoss.toFixed(2)} kg/sem`}</Formula>
          )}
          <Note>
            Exprimé en %, le rythme se réajuste tout seul quand ton poids baisse. {isBulk
              ? <>Fourchette conseillée à ton %MG ({c.gainBandLevel}) : <B>{pct(c.gainBand.min)}–{pct(c.gainBand.max)} %/sem</B>. Au-delà de ~0,5 %/sem, le surplus part surtout en gras{c.gainBand.cutFirst ? ' ; à ton %MG, mieux vaut sécher d\'abord' : ''}.</>
              : <>Fourchette conseillée à ton %MG ({c.rateBandLevel}) : <B>{pct(c.rateBand.min)}–{pct(c.rateBand.max)} %/sem</B>. Plus tu es sec, plus il faut ralentir pour garder ton muscle. Le curseur reste libre mais t'alerte au-dessus ; jamais plus de 1 %/sem.</>}
          </Note>
          {!isBulk && !c.allowBelowBmr && (
            <Callout emoji="🛡️" title="Préservation musculaire">
              <p>
                En sèche, le déficit ne dépasse jamais <B>{Math.round(maxDeficitFraction(profile) * 100)} %</B> de
                ta maintenance (plus tu es sec, plus on resserre). Ta cible ne descend donc pas sous{' '}
                <B>{fmtKcal(muscleSafeFloorKcal(profile, c.est.ok ? c.est.tdee : maintenance))}</B>. Pour perdre
                plus vite, bouge plus (cardio, pas) plutôt que de manger moins.
              </p>
            </Callout>
          )}
          <GoalSimulator maintenance={maintenance} deficit={deficit} isBulk={isBulk} />
        </>
      )
    },
    {
      id: 'macros', group: 'calories', icon: Beef,
      title: 'Répartition des macros',
      summary: `Protéines ${macros.protein} g, lipides ${macros.fat} g, glucides ${macros.carbs} g : d'où ça vient.`,
      keywords: 'macros proteines lipides glucides graisses gras grammes par kilo masse maigre plancher hormonal testosterone repartition',
      body: (
        <>
          <p>
            Les <B>protéines</B> sont calées sur ta masse maigre{usesKatch ? '' : ' (ici sur ton poids, faute de %MG)'}, les
            <B> lipides</B> sur ton poids, et les <B>glucides</B> prennent tout le reste.
            (1 g de protéines ou de glucides = 4 kcal ; 1 g de lipides = 9 kcal.)
          </p>
          {usesKatch && leanMass != null && proteinPerKgLbm != null ? (
            <Formula>{`Masse maigre = ${leanMass.toFixed(1)} kg
Protéines = ${proteinPerKgLbm.toFixed(2)} g/kg MM × ${leanMass.toFixed(1)} = ${macros.protein} g
Lipides   = ${profile.fatPerKg} g/kg × ${profile.weightKg} = ${macros.fat} g
Glucides  = (${targets.kcal} − ${macros.protein}×4 − ${macros.fat}×9) / 4 = ${macros.carbs} g`}</Formula>
          ) : (
            <Formula>{`Protéines = ${profile.proteinPerKg} g/kg × ${profile.weightKg} = ${macros.protein} g
Lipides   = ${profile.fatPerKg} g/kg × ${profile.weightKg} = ${macros.fat} g
Glucides  = (${targets.kcal} − ${macros.protein}×4 − ${macros.fat}×9) / 4 = ${macros.carbs} g`}</Formula>
          )}
          <Callout title="Comment les protéines sont choisies">
            {usesKatch ? (
              <>
                <p>
                  <B>2,4 g par kg de masse maigre</B> au maintien et en prise de masse. En sèche, elles
                  montent jusqu'à <B>3,0 g/kg</B> quand tu es très sec (10 % de MG ou moins) et que le
                  déficit atteint 500 kcal : c'est là que le muscle est le plus menacé (Helms 2014).
                  Entre les deux, la montée est progressive.
                </p>
                <p>Plancher : jamais moins de 1,8 g par kg de poids.</p>
              </>
            ) : (
              <p>Sans %MG, elles sont calées sur ton poids total ({profile.proteinPerKg} g/kg).</p>
            )}
          </Callout>
          <Callout emoji="🛡️" title="Lipides et plancher hormonal">
            <p>
              Réglés à <B>{profile.fatPerKg} g/kg</B> (0,8 par défaut, pour laisser de la place aux
              féculents), mais jamais sous le plus contraignant de 0,5 g/kg ({c.fatFloorPerKg} g) et 20 % des
              calories ({c.fatFloorPct} g), soit <B>{c.fatFloor} g</B>. En dessous, la testostérone et
              l'absorption des vitamines A, D, E et K chutent.
              {c.fatApplied > c.fatFloor ? ` Tes lipides (${c.fatApplied} g) sont au-dessus : le plancher ne joue pas.` : ` Le plancher s'applique chez toi (${c.fatApplied} g).`}
            </p>
          </Callout>
        </>
      )
    },
    {
      id: 'hydratation', group: 'calories', icon: Droplet,
      title: 'Hydratation (repère)',
      summary: `Environ ${(30 * profile.weightKg / 1000).toFixed(1)} à ${(40 * profile.weightKg / 1000).toFixed(1)} L par jour, plus l'entraînement.`,
      keywords: 'eau boire hydratation litres electrolytes sodium potassium magnesium transpiration',
      body: (
        <>
          <Formula>{`Eau/jour ≈ 30–40 ml/kg = ${Math.round(30 * profile.weightKg)}–${Math.round(40 * profile.weightKg)} ml
+ 500–1000 ml par heure d'entraînement`}</Formula>
          <Note>
            Surtout utile en sèche (moins de glucides = le corps retient moins d'eau). Pense aux
            électrolytes si tu transpires beaucoup. C'est un repère : l'app ne suit pas ce que tu bois.
          </Note>
        </>
      )
    },

    /* ------------------------------------------------------------ Coach */
    {
      id: 'mesure', group: 'coach', icon: Sparkles,
      title: 'Le coach mesure ton vrai métabolisme',
      summary: c.est.ok ? `Maintenance mesurée chez toi : ${fmtKcal(c.est.tdee)}.` : 'Ta maintenance réelle, calculée à partir de tes repas et de tes pesées.',
      keywords: 'maintenance mesuree reelle bilan energetique apport logs jours logges fenetre 21 jours estimee aberrante facteur activite reel calibration',
      body: (
        <>
          <p>
            Les formules ne sont qu'un point de départ. Dès que tu logues assez, l'app calcule ta
            maintenance <B>réelle</B> en comparant ce que tu manges et l'évolution de ton poids.
          </p>
          <Formula>{`Maintenance réelle = apport moyen − (Δpoids × 7700 / nb jours)`}</Formula>
          <Bullets items={[
            <>Sur les <B>{MAINTENANCE_WINDOW_DAYS} derniers jours</B>, les plus récents pesant davantage (un jour vieux de {MAINTENANCE_HALF_LIFE_DAYS} jours compte moitié moins). Ça dilue l'eau perdue en début de sèche tout en restant réactif.</>,
            <>Il faut ~<B>{c.neededLogDays} jours de repas loggés</B> et une semaine de pesées.</>,
            <>Une journée visiblement incomplète (moins de la moitié d'une journée type) est écartée. Une coupure de 3 jours ou plus sans log suspend la mesure.</>,
            <>Les repas estimés comptent, sauf si plus de <B>40 % des calories</B> de la période sont estimées : la mesure attend alors des jours pesés.</>,
            <>Une mesure aberrante (sous ton BMR × 1,2, signe de repas oubliés) est <B>rejetée</B> : l'app repart de ta maintenance théorique plutôt que de coller ta cible au BMR.</>
          ]} />
          <Callout title="Qu'est-ce qu'un « jour loggé » ?">
            <p><B>Pour l'assiduité</B> (« X/7 jours » du bilan) : un jour compte dès qu'un seul aliment est saisi.</p>
            <p><B>Pour mesurer ta maintenance</B> : le jour doit être à peu près complet, ou contenir un repas estimé. Une journée avec une pomme compte pour l'assiduité, pas pour la mesure.</p>
          </Callout>
          <Callout tone={c.est.ok ? 'success' : 'neutral'} title={c.est.ok ? `✓ Maintenance mesurée : ${fmtKcal(c.est.tdee)}` : 'Pas encore débloquée'}>
            {c.est.ok ? (
              <p>{c.est.loggedDays} jours loggés · apport moyen {fmtKcal(c.est.avgIntake)} · {fmtDelta(c.est.weightDeltaKg)} sur la période.</p>
            ) : (
              <>
                <p>
                  {c.est.reason === 'not-enough-logs' && `Logue tes repas : ${c.est.loggedDays}/${c.est.neededDays} jours sur 3 semaines.`}
                  {c.est.reason === 'logging-gap' && 'Une coupure de logging fausserait le bilan : l\'app attend une période bien remplie.'}
                  {c.est.reason === 'not-enough-weights' && 'Continue à te peser régulièrement (environ une semaine de pesées).'}
                  {c.est.reason === 'too-estimated' && 'Trop de calories estimées sur la période : l\'app se fie à ta tendance de poids en attendant des jours pesés.'}
                  {c.est.reason === 'no-data' && 'Commence à logger tes repas et tes pesées.'}
                </p>
                <p>En attendant : formule + ajustement anti-stagnation.</p>
              </>
            )}
          </Callout>
          <Note>
            Bonus : une fois ta maintenance mesurée, l'app en déduit ton <B>facteur d'activité réel</B>
            (maintenance ÷ BMR) et s'en sert les jours où les logs manquent.
          </Note>
        </>
      )
    },
    {
      id: 'pastilles', group: 'coach', icon: BadgeCheck,
      title: 'Les pastilles de la carte Coach',
      summary: 'Mesurée, Estimée, Anti-stagnation, Dans la cible, Pause : ce que chacune veut dire.',
      keywords: 'carte coach accueil statut pastille source cible du jour mesuree estimee anti-stagnation dans la cible pause',
      body: (
        <>
          <dl className="space-y-2.5">
            <Term t="Mesurée" d="Ta cible part de ta maintenance réellement mesurée. Le cas le plus précis." />
            <Term t="Estimée" d="Pas encore assez de données (ou mesure rejetée) : ta cible part de la formule." />
            <Term t="Anti-stagnation" d="Ta cible est corrigée de ±150 kcal parce que ton rythme s'écarte de l'objectif." />
            <Term t="Dans la cible" d="Ton rythme est déjà là où il doit être : rien à corriger." />
            <Term t="Pause" d="Pause diète active : cible tenue à ta maintenance, tes pesées ne la font pas bouger." />
          </dl>
          <Callout tone="brand" title="Chez toi aujourd'hui">
            <p>{c.paused ? 'Pause diète active.' : c.reco.note}</p>
          </Callout>
        </>
      )
    },
    {
      id: 'anti-stagnation', group: 'coach', icon: Scale,
      title: 'Anti-stagnation (±150 kcal)',
      summary: 'Si tu vas trop lentement ou trop vite, la cible se corrige une fois par semaine.',
      keywords: 'stagnation plateau ajustement correction 150 kcal trop lent trop rapide tendance tolerance',
      body: (
        <>
          <p>
            Tant que ta maintenance n'est pas mesurée, l'app surveille ton <B>rythme de poids</B> et corrige
            la cible de ±150 kcal pour rester sur ton objectif, toujours dans le bon sens.
          </p>
          {isBulk ? (
            <Formula>{`Zone OK = +${Math.abs(c.targetLoss).toFixed(2)} ± ${RATE_TOLERANCE.toFixed(2)} kg/sem
prise trop lente → +150 kcal/j | trop rapide → −150 kcal/j`}</Formula>
          ) : (
            <Formula>{`Zone OK = ${c.targetLoss.toFixed(2)} ± ${RATE_TOLERANCE.toFixed(2)} kg/sem
trop lent → −150 kcal/j | trop rapide → +150 kcal/j`}</Formula>
          )}
          <Note>
            Une correction au plus par semaine, plafonnée à ±600 kcal cumulés. En maintien, un poids
            stable n'est jamais vu comme « trop lent ».
          </Note>
          <Callout title="État actuel">
            <p>{c.hint.message}</p>
            {c.offset !== 0 && <p>Ajustement cumulé : {c.offset > 0 ? '+' : ''}{c.offset} kcal/j.</p>}
          </Callout>
        </>
      )
    },
    {
      id: 'bilan', group: 'coach', icon: CalendarCheck,
      title: 'Le bilan de la semaine',
      summary: 'Une fois par semaine sur l\'Accueil : tendance, maintenance, assiduité.',
      keywords: 'bilan hebdomadaire hebdo semaine recap resume assiduite vu',
      body: (
        <>
          <p>
            Une fois par semaine, l'Accueil affiche un récap comme le ferait un coach : ta tendance de
            poids, ta maintenance mesurée, ton assiduité de logging et où tu en es de ton objectif.
            Aucune saisie ; touche « Vu » pour le refermer.
          </p>
          <Note>C'est aussi là que l'app te suggère une pause diète, un mini-cut ou la reprise après une récupération.</Note>
        </>
      )
    },

    /* ------------------------------------------------------------ Phases & sécurité */
    {
      id: 'securite', group: 'phases', icon: ShieldCheck,
      title: 'Planchers et rythme maximum',
      summary: `Ta cible ne descend jamais sous ${fmtKcal(minSafeKcal(profile, { allowBelowBmr: c.allowBelowBmr }))}.`,
      keywords: 'securite plancher minimum bmr calories rythme max maximum muscle perte trop rapide absolu',
      body: (
        <>
          <p>La sécurité passe avant la vitesse. Ces garde-fous s'appliquent à chaque décision :</p>
          <Formula>{`Plancher calorique : ≥ ${fmtKcal(minSafeKcal(profile, { allowBelowBmr: c.allowBelowBmr }))}  ${c.allowBelowBmr ? '(plancher absolu)' : '(ton BMR)'}
Plancher lipidique : ≥ ${c.fatFloor} g
Rythme max (sèche) : ≤ 1 %/sem  (≈ ${(0.01 * profile.weightKg).toFixed(2)} kg/sem)
Rythme max (prise) : ≤ ~0,75 %/sem (≈ ${(0.0075 * profile.weightKg).toFixed(2)} kg/sem)`}</Formula>
          <Note>
            {isBulk
              ? 'En prise de masse, au-delà de ~0,75 %/sem le surplus part surtout en gras : la cible baisse de 150 kcal pour revenir en lean bulk (sauf si tu as coupé la garde).'
              : 'Si un déficit plus fort passait sous le plancher, l\'app ne coupe pas davantage : elle te suggère de bouger plus. Au-delà de 1 %/sem, la perte attaque le muscle (Garthe 2011) : la cible remonte de 150 kcal (sauf si tu as coupé la garde).'}
          </Note>
          <Note>
            Le plancher BMR est désactivable pour un utilisateur averti, mais jamais le plancher absolu
            de {fmtKcal(c.absoluteFloor)}.
          </Note>
        </>
      )
    },
    {
      id: 'interrupteurs', group: 'phases', icon: SlidersHorizontal,
      title: 'Tes interrupteurs de réglage',
      summary: 'Les options que tu peux activer ou couper, leur état chez toi et où les trouver.',
      keywords: 'reglages avances options interrupteurs toggle garde anti-emballement plancher bmr masse grasse pause diete report repas estimes activer desactiver',
      body: (
        <>
          <Note>Par défaut, tout est réglé pour la sécurité et la simplicité : ne change que si tu sais pourquoi.</Note>
          <div className="space-y-2">
            <OptionRow
              title="Suivre la masse grasse (%MG)"
              where="Plan → Objectif → Mon profil"
              on={profile.useBodyFat !== false}
              onTxt="BMR Katch-McArdle, protéines calées sur la masse maigre, rythme conseillé selon ta sécheresse."
              offTxt="Pas besoin de balance à impédance : formule Mifflin-St Jeor, protéines sur le poids total."
            />
            <OptionRow
              title="Pause diète (vacances)"
              where="Plan → Objectif → Mon objectif"
              on={c.paused}
              onTxt="Cible tenue à ta maintenance, aucun recalcul sur tes pesées. Ton objectif est gardé pour la reprise."
              offTxt="Le coach suit ton objectif normalement."
            />
            <OptionRow
              title="Garde anti-emballement"
              where="Plan → Réglages → Garde-fous de la cible"
              on={c.settings.slowdownGuardEnabled ?? true}
              onTxt="Si tu progresses trop vite, la cible se corrige de 150 kcal (elle remonte en sèche pour garder le muscle, baisse en prise pour limiter le gras)."
              offTxt="Sèche agressive ou dirty bulk assumé : la cible ne te ralentit jamais."
            />
            <OptionRow
              title="Plancher de sécurité (BMR)"
              where="Plan → Réglages → Garde-fous de la cible"
              on={!c.allowBelowBmr}
              onTxt="La cible ne descend jamais sous ton métabolisme de base."
              offTxt={`Tu autorises de descendre sous ton BMR. Le plancher absolu (${fmtKcal(c.absoluteFloor)}) reste appliqué.`}
            />
            <OptionRow
              title="Report des repas estimés"
              where="Plan → Réglages → Repas mangés dehors"
              on={c.carry.enabled}
              onTxt="Le surplus d'un repas estimé que la journée ne peut pas absorber est retiré des jours suivants."
              offTxt="Le surplus reste sur sa journée."
            />
          </div>
        </>
      )
    },
    {
      id: 'pause', group: 'phases', icon: Coffee,
      title: 'Pause diète',
      summary: 'Une ou deux semaines à maintenance pendant une longue sèche, ou en vacances.',
      keywords: 'pause diete diet break vacances maintenance matador leptine hormones adaptation metabolique sèche longue',
      body: (
        <>
          <p>
            Une sèche continue trop longue accentue l'adaptation du métabolisme et la baisse hormonale.
            Une <B>pause à maintenance de 1 à 2 semaines</B> toutes les 6 à 12 semaines le préserve mieux
            sur la durée (étude MATADOR, Byrne 2018).
          </p>
          <Note>
            Le bilan de la semaine te la suggère dès ~8 semaines de sèche, plus fortement au-delà de 12,
            ou si ta maintenance mesurée chute nettement sous la théorique.
          </Note>
          <Callout emoji="🏖️" title="En vacances">
            <p>
              Active la <B>pause diète</B> : cible tenue à ta maintenance, pesées ignorées, objectif
              conservé. Couper le déficit quelques jours n'annule pas ta sèche.
            </p>
            <Where>Plan → Objectif → Mon objectif</Where>
          </Callout>
          <Callout tone={c.dietBreak.recommended ? 'warn' : 'neutral'} title="État actuel">
            <p>
              {isBulk
                ? 'Tu es en prise de masse : c\'est le mini-cut qui joue ce rôle (voir « Prise de masse et mini-cut »).'
                : deficit <= 0
                ? 'Tu es au maintien, pas de sèche en cours.'
                : c.dietBreak.recommended
                ? c.dietBreak.message
                : c.dietBreak.weeksOnCut != null
                ? `Sèche en cours depuis ~${Math.round(c.dietBreak.weeksOnCut)} semaine(s) : rien à signaler.`
                : 'Le compteur de sèche démarre à ta prochaine pesée.'}
            </p>
          </Callout>
        </>
      )
    },
    {
      id: 'recup', group: 'phases', icon: HeartPulse,
      title: 'Récupération après une sèche',
      summary: '2 à 3 semaines à maintenance, puis l\'app te propose de reprendre.',
      keywords: 'recuperation recup apres seche maintien reprendre relancer memoire musculaire',
      body: (
        <>
          <p>
            Passer en <B>Maintien</B> juste après une sèche lance une phase de récupération : 2 à 3 semaines
            à maintenance avec un entraînement lourd relancent hormones et force, et récupèrent une partie
            du muscle.
          </p>
          <Note>
            Le piège est d'y rester bloqué. Après 2 semaines, une carte de l'Accueil te propose de
            reprendre une sèche douce en un tap, au rythme prudent conseillé pour ton %MG ; après 4
            semaines, elle insiste.
          </Note>
          {c.recovery.message && (
            <Callout tone="brand" title="Chez toi"><p>{c.recovery.message}</p></Callout>
          )}
        </>
      )
    },
    {
      id: 'refeed', group: 'phases', icon: CalendarHeart,
      title: 'Jour de recharge (refeed)',
      summary: 'Un jour à maintenance par les glucides, appliqué en un tap depuis l\'Accueil.',
      keywords: 'refeed recharge glycogene glucides leptine jour de recharge appliquer',
      body: (
        <>
          <p>
            Un jour où tu remontes à la maintenance <B>uniquement par les glucides</B> : ça recharge le
            glycogène et soutient la leptine, la performance et le moral. Protéines inchangées, lipides
            bas ce jour-là.
          </p>
          {c.refeed.applicable && c.refeed.macros ? (
            <>
              <Note>Fréquence conseillée à ton %MG ({c.rateBandLevel}) : <B>{c.refeed.frequencyLabel}</B>.</Note>
              <Formula>{`Jour de recharge (≈ maintenance) :
Calories  ≈ ${c.refeed.macros.kcal} kcal (au lieu de ${fmtKcal(profile.targetKcal ?? targets.kcal)})
Protéines = ${c.refeed.macros.protein} g (inchangées)
Lipides   = ${c.refeed.macros.fat} g (bas)
Glucides  = ${c.refeed.macros.carbs} g${c.refeed.carbsPerKg ? ` (${c.refeed.carbsPerKg.toFixed(1)} g/kg)` : ''} (↑ recharge)`}</Formula>
              <Callout title="L'appliquer">
                <p>
                  Quand il est conseillé, la carte « Jour de recharge » de l'Accueil l'applique en un tap :
                  le menu du jour est recalculé, et tout revient à la normale demain. Cumulable avec une
                  séance. Un pic de poids le lendemain, c'est de l'eau, pas du gras.
                </p>
              </Callout>
            </>
          ) : (
            <Note>Les recharges n'ont de sens qu'en sèche. Au maintien, tu manges déjà à ta maintenance.</Note>
          )}
        </>
      )
    },
    {
      id: 'bulk', group: 'phases', icon: TrendingUp,
      title: 'Prise de masse et mini-cut',
      summary: 'Le miroir de la sèche : un surplus piloté par le rythme, et des mini-sèches.',
      keywords: 'prise de masse bulk lean bulk dirty surplus mini-cut mini cut muscle gras',
      body: (
        <>
          <p>
            En <B>prise de masse</B>, tout est symétrique de la sèche : un <B>surplus</B> piloté par un
            rythme de gain. Si tu prends trop lentement, il monte de 150 kcal ; trop vite (surtout du
            gras), il baisse de 150.
          </p>
          <Formula>{`Lean bulk conseillé : 0,10–0,50 %/sem
Protéines : ~2,4 g/kg de masse maigre`}</Formula>
          <Where>Plan → Objectif → Mon objectif → Prise de masse</Where>
          <Note>
            <span aria-hidden>🔪 </span><B>Mini-cut</B> : après ~10 semaines de prise continue (plus
            fortement après 16), ou si ton %MG grimpe trop, le bilan de la semaine te propose 2 à 4
            semaines de sèche pour que le surplus reparte en muscle plutôt qu'en gras.
          </Note>
        </>
      )
    },

    /* ------------------------------------------------------------ Lexique */
    {
      id: 'lexique', group: 'lexique', icon: BookMarked,
      title: 'Petit lexique',
      summary: 'Tous les mots de l\'app expliqués en une ligne.',
      keywords: 'lexique definitions glossaire bmr tdee deficit surplus masse maigre lbm macros moyenne mobile tendance role refeed pause mini-cut lean bulk mps synthese repas estime report exclusion appoint pre-training adaptation metabolique',
      body: (
        <dl className="space-y-2.5">
          <Term t="BMR (métabolisme de base)" d="L'énergie brûlée au repos complet, sans bouger." />
          <Term t="TDEE / Maintenance" d="Ta dépense sur une journée (BMR + activité). Manger à ce niveau = poids stable." />
          <Term t="Déficit / Surplus" d="Calories en dessous (sèche) ou au-dessus (prise) de ta maintenance." />
          <Term t="Masse maigre" d="Ton poids hors graisse (muscle, organes, os, eau). Sert à caler les protéines." />
          <Term t="Macros (P / G / L)" d="Protéines, Glucides, Lipides. 1 g P = 4 kcal, 1 g G = 4 kcal, 1 g L = 9 kcal." />
          <Term t="Moyenne mobile / Tendance" d="Le lissage de tes pesées et leur pente réelle (kg/sem), pour ignorer le bruit du quotidien." />
          <Term t="Rôle d'un aliment" d="Sa fonction dans la diète (protéine, féculent, légume, fruit, lipide…). Sert aux remplacements." />
          <Term t="Exclusion" d="Un aliment que tu ne peux pas manger (régime, allergie) : rien ne le fait revenir." />
          <Term t="Ingrédient d'appoint" d="Un aliment occasionnel que tu ajoutes ou retires du plan selon que tu en as." />
          <Term t="Repas estimé" d="Un repas non pesé (resto, plat d'un proche) dont l'app estime les macros." />
          <Term t="Report" d="Le surplus d'un repas estimé retiré des jours suivants quand la journée ne peut pas l'absorber." />
          <Term t="Collation pré-training" d="Galettes de riz, miel et banane avant ta séance, déclarée le jour même." />
          <Term t="Synthèse musculaire (MPS)" d="La construction de muscle après un repas protéiné ; maximale vers 0,4 g/kg par repas." />
          <Term t="Adaptation métabolique" d="La baisse de dépense quand on sèche longtemps. Les pauses diète la limitent." />
          <Term t="Refeed / Jour de recharge" d="Journée à maintenance via les glucides, pour recharger le glycogène." />
          <Term t="Pause diète (diet break)" d="1 à 2 semaines à maintenance pendant une sèche longue." />
          <Term t="Mini-cut" d="Courte sèche (2 à 4 semaines) au milieu d'une prise de masse." />
          <Term t="Lean bulk" d="Prise de masse lente : gagner du muscle avec un minimum de gras." />
        </dl>
      )
    }
  ];
}
