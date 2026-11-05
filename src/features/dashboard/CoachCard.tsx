import { useEffect, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui';
import { Sparkles, ChevronDown, Info, ShieldAlert, AlertTriangle, Coffee } from 'lucide-react';
import type { GoalMode, Meal } from '@/types';
import { mealsRepo } from '@/services/repositories';
import { useWeightStore } from '@/store/weightStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useLogStore } from '@/store/logStore';
import { estimateMaintenance, computeAdaptiveTarget, MAINTENANCE_WINDOW_DAYS } from '@/lib/coach';
import { trendStats, smoothedBodyFatPct } from '@/lib/trend';
import { fmtKcal, fmtDelta } from '@/lib/format';

const KCAL_PER_KG = 7700;

/**
 * Carte "Coach" : explique D'OÙ vient la cible calorique que tu suis aujourd'hui.
 * La cible est ajustée AUTOMATIQUEMENT à chaque pesée (cf. recalcTargetsFromWeight) :
 *  - maintenance réelle mesurée (apport loggé vs variation de poids), sinon
 *  - correction anti-stagnation ±150 kcal selon le rythme de perte (1×/sem max).
 * Aucun geste manuel : tu ouvres l'app, tu manges le chiffre affiché.
 *
 * Lisibilité : l'essentiel est visible d'un coup d'œil (chiffre, source, rythme, tuiles),
 * et les explications longues sont repliées dans des lignes dépliables (« un tap = un
 * détail »), pour garder toute l'info sans noyer l'écran.
 */
export function CoachCard() {
  const weights = useWeightStore((s) => s.weights);
  const byId = useFoodsStore((s) => s.byId);
  const foodsLen = useFoodsStore((s) => s.foods.length);
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const todayMeals = useLogStore((s) => s.meals);

  const [allMeals, setAllMeals] = useState<Meal[]>([]);

  // Recharge tous les repas (toutes dates) pour le bilan énergétique.
  // Se rafraîchit quand le log du jour change (todayMeals) ou la base d'aliments.
  useEffect(() => {
    let cancelled = false;
    mealsRepo.all().then((m) => { if (!cancelled) setAllMeals(m); });
    return () => { cancelled = true; };
  }, [todayMeals, foodsLen]);

  if (!profile || !settings) return null;

  const deficit = settings.deficitKcal ?? 400;
  const offset = settings.trendAdjustKcal ?? 0;
  // Direction : mode explicite si présent, sinon inféré du signe du déficit (négatif = surplus).
  const mode: GoalMode = settings.goalMode ?? (deficit > 0 ? 'cut' : deficit < 0 ? 'bulk' : 'maintain');
  const isBulk = mode === 'bulk';

  // Rythme VISÉ (%/sem, positif = progression vers l'objectif) : le rythme configuré du
  // mode, sinon dérivé du déficit/surplus courant.
  const targetRatePct = isBulk
    ? (settings.gainRatePctPerWeek ??
       (deficit < 0 && profile.weightKg > 0 ? ((-deficit * 7) / KCAL_PER_KG / profile.weightKg) * 100 : 0))
    : (settings.lossRatePctPerWeek ??
       (deficit > 0 && profile.weightKg > 0 ? ((deficit * 7) / KCAL_PER_KG / profile.weightKg) * 100 : 0));
  // Rythme RÉEL lissé (%/sem, positif = progression : perte en sèche, prise en bulk).
  const actualWeeklyKg = trendStats(weights).weeklyKgPerWeek;
  const actualRatePct =
    actualWeeklyKg != null && profile.weightKg > 0
      ? ((isBulk ? actualWeeklyKg : -actualWeeklyKg) / profile.weightKg) * 100
      : null;
  const est = estimateMaintenance(allMeals, byId, weights, MAINTENANCE_WINDOW_DAYS);
  // %MG lissé (comme recalcTargetsFromWeight) : la reco affichée doit coller à celle réellement
  // appliquée, qui calcule ses garde-fous sur un %MG moyenné plutôt que la lecture brute.
  const bfSmoothed = profile.bodyFatPct != null ? smoothedBodyFatPct(weights) : null;
  const coachProfile = bfSmoothed != null ? { ...profile, bodyFatPct: bfSmoothed } : profile;
  const reco = computeAdaptiveTarget(
    coachProfile, deficit, offset, allMeals, byId, weights,
    settings.measuredActivityFactor, settings.slowdownGuardEnabled ?? true, mode,
    settings.allowBelowBmr ?? false
  );
  // La cible réellement appliquée à la diète (ce que tu suis aujourd'hui).
  const applied = profile.targetKcal ?? reco.targetKcal;
  // Doit refléter EXACTEMENT la condition de déclenchement de recalcTargetsFromWeight
  // dans weightStore (`settings?.adaptiveTargets` truthy).
  const autoOn = !!settings.adaptiveTargets;
  const paused = !!settings.dietPaused;

  const color =
    paused ? 'border-brand/30 bg-brand/5'
    : reco.source === 'measured' ? 'border-brand/30 bg-brand/5'
    : reco.source === 'trend-nudge' ? 'border-warn/40 bg-warn/5'
    : reco.source === 'in-range' ? 'border-success/40 bg-success/5'
    : 'border-border';

  // Pastille de STATUT (courte) + phrase de source (une ligne, en clair). Le cas « mesurée
  // aberrante » (source formula + measuredImplausible) est distingué : cible = estimée.
  const status: { label: string; tone: PillTone } =
    paused ? { label: 'Pause', tone: 'brand' }
    : reco.source === 'measured' ? { label: 'Mesurée', tone: 'brand' }
    : reco.measuredImplausible ? { label: 'Estimée', tone: 'warn' }
    : reco.source === 'trend-nudge' ? { label: 'Anti-stagnation', tone: 'warn' }
    : reco.source === 'in-range' ? { label: 'Dans la cible', tone: 'success' }
    : { label: 'Estimée', tone: 'muted' };

  const subtitle =
    paused ? 'Tenue à ta maintenance : tes pesées ne la font pas bouger.'
    : reco.source === 'measured' ? 'Calculée sur ta maintenance réellement mesurée.'
    : reco.measuredImplausible ? 'Basée sur ta maintenance estimée (tes logs sont trop incomplets pour la mesurer).'
    : reco.source === 'trend-nudge' ? 'Formule ajustée à ta tendance de poids.'
    : reco.source === 'in-range' ? 'Ton rythme est déjà dans la cible visée.'
    : 'Basée sur la formule de ta maintenance.';

  // Invitation à logger pour débloquer la mesure auto de la maintenance (plus précise).
  const logNote =
    reco.source !== 'measured' && !est.ok && est.reason === 'not-enough-logs'
      ? ` Logue tes repas (${est.loggedDays}/${est.neededDays} j sur 2 sem.) pour passer à une cible mesurée sur ton métabolisme réel.`
      : reco.source !== 'measured' && !est.ok && est.reason === 'logging-gap'
      ? ' Des jours non loggés sur la période faussaient la mesure : on garde la cible formule (sans l’écraser) le temps de retrouver quelques jours pesés ET loggés d’affilée.'
      : reco.source !== 'measured' && !est.ok && est.reason === 'too-estimated'
      ? ' Beaucoup de repas estimés (non pesés) cette quinzaine : on se fie à ta tendance de poids plutôt qu’à un apport approximatif, ta cible ne sera pas faussée.'
      : '';

  // Alerte "bilan" : l'apport loggé ne crée pas le déficit (sèche) / surplus (prise) voulu.
  const balanceOff = est.ok && (isBulk ? est.measuredBalance < 100 : est.measuredBalance > -100);

  return (
    <Card className={`space-y-3 ${color}`}>
      {/* En-tête compact : icône + Coach + pastille de statut */}
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-brand shrink-0" />
        <span className="text-xs uppercase tracking-wide font-semibold text-text-muted">Coach</span>
        <Pill tone={status.tone} className="ml-auto">{status.label}</Pill>
      </div>

      {/* Héro : le chiffre à suivre aujourd'hui, en grand */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-text-muted">Cible du jour</div>
        <div className="text-3xl font-extrabold tabular-nums leading-none mt-0.5">{fmtKcal(applied)}</div>
        <p className="text-xs text-text-muted mt-1.5 leading-snug">
          {subtitle}
          {!paused && reco.source !== 'measured' && offset !== 0 && (
            <span> Dont {offset > 0 ? '+' : ''}{offset} kcal d’ajustement anti-stagnation.</span>
          )}
        </p>
      </div>

      {/* Diagnostic chiffré : maintenance mesurée vs apport réel vs bilan (déjà scannable). */}
      {est.ok && (
        <div>
          <div className="grid grid-cols-3 gap-2 text-center rounded-xl bg-surface-hi/60 p-2.5">
            <Metric label="Maintenance" value={fmtKcal(est.tdee)} sub="mesurée" />
            <Metric label="Apport réel" value={fmtKcal(est.avgIntake)} sub="moyen loggé" />
            <Metric
              label="Bilan réel"
              value={`${est.measuredBalance > 0 ? '+' : ''}${est.measuredBalance} kcal`}
              sub={isBulk
                ? (est.measuredBalance > 0 ? 'surplus ✓' : 'pas de surplus')
                : (est.measuredBalance < 0 ? 'déficit ✓' : 'pas de déficit')}
              tone={isBulk
                ? (est.measuredBalance >= 100 ? 'good' : 'warn')
                : (est.measuredBalance <= -100 ? 'good' : 'warn')}
            />
          </div>
          {reco.source === 'measured' && (
            <p className="text-[11px] text-text-muted mt-1 text-center">
              Sur {est.loggedDays} j de logs · {fmtDelta(est.weightDeltaKg)} de poids.
            </p>
          )}
        </div>
      )}

      {/* Rythme réel vs visé (la métrique de pilotage), sur une ligne.
          L'équivalent en kg/sem est rappelé entre parenthèses : c'est la même mesure que
          la tendance affichée sur la pesée du jour, exprimée ici en % du poids (le % se
          réajuste tout seul à mesure qu'on s'allège, contrairement à un seuil en kg). */}
      {actualRatePct != null && targetRatePct > 0 && (
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-text-muted">Rythme réel</span>
          <span>
            <span className={`font-semibold ${actualRatePct >= targetRatePct - 0.1 ? 'text-success' : 'text-warn'}`}>
              {actualRatePct.toFixed(2)} %/sem
            </span>
            {actualWeeklyKg != null && (
              <span className="text-text-muted"> ({fmtDelta(actualWeeklyKg)})</span>
            )}
            <span className="text-text-muted"> · visé {targetRatePct.toFixed(2)}</span>
          </span>
        </div>
      )}

      {/* Explications LONGUES, repliées : un tap = un détail. */}
      <div className="space-y-1.5">
        {paused && (
          <InsightRow tone="brand" icon={Coffee} title="Pause diète active">
            Ta cible est tenue à ta maintenance et tes pesées ne la font pas bouger. Reprends la
            sèche depuis Plan → Objectif → Mon objectif quand tu veux.
          </InsightRow>
        )}

        <InsightRow tone="info" icon={Info} title="Pourquoi cette cible ?">
          {reco.note}{logNote}
        </InsightRow>

        {!paused && reco.deficitCapped && (
          <InsightRow tone="warn" icon={ShieldAlert} title="Déficit plafonné pour préserver ton muscle">
            La cible ne descend pas jusqu'à ton métabolisme de base. Pour accélérer, augmente la
            dépense (cardio, pas) plutôt que de couper l'apport.
          </InsightRow>
        )}

        {balanceOff && (
          <InsightRow
            tone="warn"
            icon={AlertTriangle}
            title={isBulk ? 'Ton apport ne crée pas de surplus' : 'Ton apport ne crée pas de déficit'}
          >
            {isBulk ? (
              <>
                {est.measuredBalance <= 0
                  ? 'Ton apport loggé est à/sous ta maintenance : à ce rythme tu ne prends pas.'
                  : 'Ton apport loggé est à peine au-dessus de ta maintenance : le surplus réel est trop faible.'}
                {' '}Monte l'apport d'un cran (vise la cible affichée) pour que la prise progresse,
                sans forcer au-delà, pour limiter le gras.
              </>
            ) : (
              <>
                {est.measuredBalance >= 0
                  ? 'Ton apport loggé dépasse ta maintenance : à ce rythme tu ne perds pas.'
                  : 'Ton apport loggé est quasi à ta maintenance : le déficit réel est trop faible.'}
                {' '}Soit tu manges au-dessus de la cible, soit des calories ne sont pas comptées
                (portions estimées, huile de cuisson, boissons). Baisse le déficit d'un cran ou
                resserre la pesée des aliments.
              </>
            )}
          </InsightRow>
        )}
      </div>

      {/* Pied : seulement quand le mode adaptatif est coupé (comment le réactiver). */}
      {!autoOn && (
        <p className="text-[11px] text-text-muted pt-0.5">
          ⓘ Mode adaptatif désactivé : active-le dans Plan pour appliquer cette cible automatiquement.
        </p>
      )}
    </Card>
  );
}

type PillTone = 'brand' | 'warn' | 'success' | 'muted';

function Pill({ tone, className = '', children }: { tone: PillTone; className?: string; children: ReactNode }) {
  const cls =
    tone === 'brand' ? 'text-brand bg-brand/10'
    : tone === 'warn' ? 'text-warn bg-warn/10'
    : tone === 'success' ? 'text-success bg-success/10'
    : 'text-text-muted bg-surface-hi';
  return (
    <span className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 ${cls} ${className}`}>
      {children}
    </span>
  );
}

/**
 * Ligne d'explication repliable : titre court toujours visible, texte long au tap. Garde
 * l'info dense sans allonger l'écran par défaut.
 */
function InsightRow({
  tone, icon: Icon, title, children
}: { tone: 'info' | 'warn' | 'brand'; icon: typeof Info; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box =
    tone === 'warn' ? 'bg-warn/5 border-warn/30'
    : tone === 'brand' ? 'bg-brand/5 border-brand/25'
    : 'bg-surface-hi/60 border-transparent';
  const iconCls = tone === 'warn' ? 'text-warn' : tone === 'brand' ? 'text-brand' : 'text-text-muted';
  const titleCls = tone === 'warn' ? 'text-warn' : 'text-text';
  return (
    <div className={`rounded-xl border ${box}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left tap"
      >
        <Icon size={15} className={`shrink-0 ${iconCls}`} />
        <span className={`flex-1 text-xs font-semibold ${titleCls}`}>{title}</span>
        <ChevronDown size={15} className={`shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-2.5 text-xs text-text-muted leading-relaxed">{children}</div>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'good' | 'warn' }) {
  const toneClass = tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warn' : 'text-text';
  return (
    <div>
      <div className="text-[10px] uppercase text-text-muted">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[10px] text-text-muted">{sub}</div>
    </div>
  );
}
