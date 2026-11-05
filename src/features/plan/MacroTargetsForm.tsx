import { useEffect, useState } from 'react';
import { CollapsibleCard, HelpHint, ToggleRow } from '@/components/ui';
import { Gauge, Target } from 'lucide-react';
import type { GoalMode } from '@/types';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { bmr, tdee, recommendedRateRange, recommendedGainRange, maxDeficitFraction, muscleSafeFloorKcal } from '@/lib/nutrition';
import { fmtKcal } from '@/lib/format';
import { haptic } from '@/lib/haptic';

/**
 * Cibles caloriques — piloté par le RYTHME visé (% du poids corporel / semaine),
 * l'approche standard en science du sport (Helms/Aragon/Garthe) : le déficit (sèche) ou
 * le surplus (prise de masse) se recalibre tout seul à mesure que le poids bouge, au
 * lieu d'un chiffre figé.
 *  - Affiche BMR / Maintenance / Cible (lecture seule, calculés depuis le profil)
 *  - Choix Sèche / Maintien / Prise de masse + curseur de rythme (fourchette selon le mode)
 *  - Pause diète (vacances). Les garde-fous (anti-emballement, plancher BMR) sont dans
 *    l'onglet Réglages (TargetSafetyPanel) : on les règle une fois, pas à chaque visite.
 *  - Le choix règle le rythme + le déficit/surplus dérivé, active l'adaptatif, recalcule le plan.
 */

/** ~7700 kcal par kg de masse corporelle. */
const KCAL_PER_KG = 7700;

/** Bornes du curseur par mode (% du poids / semaine). */
const RANGE = {
  cut:  { min: 0.25, max: 1.0,  step: 0.05, def: 0.75, shortcuts: [0.5, 0.75, 1.0] },
  bulk: { min: 0.10, max: 0.50, step: 0.05, def: 0.25, shortcuts: [0.25, 0.35, 0.5] }
} as const;

export function MacroTargetsForm() {
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const recalc = useProfileStore((s) => s.recalcTargetsFromWeight);
  const setDietPaused = useProfileStore((s) => s.setDietPaused);
  const toast = useUIStore((s) => s.toast);

  // Rythme de perte effectif (sèche) : stocké, sinon dérivé d'un déficit legacy.
  const effectiveLossRate = (() => {
    if (settings?.lossRatePctPerWeek != null) return settings.lossRatePctPerWeek;
    const d = settings?.deficitKcal ?? 0;
    if (!profile || d <= 0) return 0;
    return ((d * 7) / KCAL_PER_KG / profile.weightKg) * 100;
  })();
  // Rythme de prise effectif (bulk) : stocké, sinon dérivé d'un surplus legacy.
  const effectiveGainRate = (() => {
    if (settings?.gainRatePctPerWeek != null) return settings.gainRatePctPerWeek;
    const d = settings?.deficitKcal ?? 0;
    if (!profile || d >= 0) return 0;
    return ((-d * 7) / KCAL_PER_KG / profile.weightKg) * 100;
  })();

  // Direction courante : mode explicite si présent, sinon inféré du signe legacy.
  const effectiveMode: GoalMode =
    settings?.goalMode ??
    (effectiveLossRate >= 0.05 ? 'cut' : effectiveGainRate >= 0.05 ? 'bulk' : 'maintain');

  const [mode, setMode] = useState<GoalMode>(effectiveMode);
  // Valeurs des curseurs EN COURS de drag (commit à la relâche), une par mode.
  const [lossRate, setLossRate] = useState(() =>
    clamp(RANGE.cut, effectiveLossRate || RANGE.cut.def));
  const [gainRate, setGainRate] = useState(() =>
    clamp(RANGE.bulk, effectiveGainRate || RANGE.bulk.def));

  // Resync si le mode/rythme change ailleurs (ex. bascule maintien auto à l'objectif).
  useEffect(() => {
    setMode(effectiveMode);
    if (effectiveLossRate >= 0.05) setLossRate(clamp(RANGE.cut, effectiveLossRate));
    if (effectiveGainRate >= 0.05) setGainRate(clamp(RANGE.bulk, effectiveGainRate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.goalMode, settings?.lossRatePctPerWeek, settings?.gainRatePctPerWeek, settings?.deficitKcal]);

  if (!profile || !settings) return null;

  const restingBmr = Math.round(bmr(profile));
  const maintenance = Math.round(tdee(profile));
  const targetKcal = profile.targetKcal ?? maintenance;
  const isBulk = mode === 'bulk';
  const cfg = isBulk ? RANGE.bulk : RANGE.cut;
  const rate = isBulk ? gainRate : lossRate;
  const setRate = isBulk ? setGainRate : setLossRate;
  // Fourchette recommandée selon le %MG (sec → prend/perd plus prudemment).
  const rec = isBulk ? recommendedGainRange(profile) : recommendedRateRange(profile);
  const bfLabel = rec.level === 'high' ? '%MG élevé' : rec.level === 'low' ? '%MG bas' : '%MG modéré';

  // kcal/j (déficit ou surplus) pour un rythme donné, et kg/sem correspondants.
  const kcalFromRate = (r: number) => Math.round((r / 100) * profile.weightKg * KCAL_PER_KG / 7);
  const kgPerWeek = (r: number) => (r / 100) * profile.weightKg;
  // Cible affichée pour le rythme courant (maintenance − déficit OU + surplus).
  const targetForRate = (r: number) => maintenance + (isBulk ? kcalFromRate(r) : -kcalFromRate(r));

  // Applique un mode + rythme : persiste goalMode, le rythme du bon champ, le déficit
  // SIGNÉ (positif = déficit, négatif = surplus), les dates de phase, (ré)active
  // l'adaptatif, puis recalcule. Préserve la date de début de phase existante.
  const commit = async (nextMode: GoalMode, r: number, label: string) => {
    const now = Date.now();
    // Passer en Maintien EN VENANT d'une sèche = phase de récupération : on horodate pour
    // le rappel « récup faite, reprends ». Tout autre mode efface le marqueur.
    const wasCut = settings.goalMode === 'cut' || settings.cutStartedAt != null;
    const base = {
      ...settings,
      adaptiveTargets: true,
      goalMode: nextMode
    };
    let next = base;
    if (nextMode === 'cut') {
      const deficit = kcalFromRate(r);
      next = { ...base, lossRatePctPerWeek: r, deficitKcal: deficit,
               cutStartedAt: settings.cutStartedAt ?? now, bulkStartedAt: undefined, recoveryStartedAt: undefined };
    } else if (nextMode === 'bulk') {
      const surplus = kcalFromRate(r);
      next = { ...base, gainRatePctPerWeek: r, deficitKcal: -surplus,
               bulkStartedAt: settings.bulkStartedAt ?? now, cutStartedAt: undefined, recoveryStartedAt: undefined };
    } else {
      next = { ...base, lossRatePctPerWeek: 0, gainRatePctPerWeek: 0, deficitKcal: 0,
               cutStartedAt: undefined, bulkStartedAt: undefined,
               recoveryStartedAt: wasCut ? (settings.recoveryStartedAt ?? now) : undefined };
    }
    await saveSettings(next);
    await recalc();
    const cible = nextMode === 'maintain' ? maintenance : targetForRate(r);
    toast(`${label} · ${fmtKcal(cible)} / jour`, 'success');
  };

  const chooseMode = async (m: GoalMode) => {
    haptic('selection');
    setMode(m);
    if (m === 'maintain') return commit('maintain', 0, 'Maintien');
    if (m === 'cut') return commit('cut', lossRate, `Sèche ${lossRate.toFixed(2)} %/sem`);
    return commit('bulk', gainRate, `Prise de masse ${gainRate.toFixed(2)} %/sem`);
  };

  const label = (r: number) => (isBulk ? `Prise de masse ${r.toFixed(2)} %/sem` : `Sèche ${r.toFixed(2)} %/sem`);

  const commitSlider = async () => {
    if (mode === 'maintain') return;
    const eff = isBulk ? effectiveGainRate : effectiveLossRate;
    if (Math.abs(rate - eff) < 1e-6) return; // rien n'a bougé
    haptic('selection');
    await commit(mode, rate, label(rate));
  };

  const pickRate = async (r: number) => {
    haptic('selection');
    setRate(r);
    await commit(mode, r, label(r));
  };

  const inRecBand = rate >= rec.min - 1e-9 && rate <= rec.max + 1e-9;
  const aboveRecBand = rate > rec.max + 1e-9;
  const fmtPct = (r: number) => r.toFixed(2).replace('.', ',');

  // Garde-fou anti-fonte musculaire : le déficit demandé par le rythme est-il plafonné ?
  // (En sèche uniquement ; la maintenance de référence ici est la formule.)
  const maxFrac = maxDeficitFraction(profile);
  const requestedDeficit = kcalFromRate(rate);
  const muscleFloor = muscleSafeFloorKcal(profile, maintenance, { allowBelowBmr: settings.allowBelowBmr ?? false });
  const cappedDeficit = Math.max(0, maintenance - muscleFloor);
  const deficitCapped = !isBulk && mode === 'cut' && requestedDeficit > cappedDeficit + 1;
  const paused = !!settings.dietPaused;

  return (
    <CollapsibleCard
      title="Mon objectif"
      icon={<Target size={18} />}
      summary={paused
        ? `En pause · ${fmtKcal(targetKcal)}/j (maintenance)`
        : mode === 'maintain'
        ? `Maintien · ${fmtKcal(targetKcal)}/j`
        : `${isBulk ? 'Prise de masse' : 'Sèche'} ${fmtPct(rate)} %/sem · ${fmtKcal(targetKcal)}/j`}
    >
      <HelpHint>
        Calculé depuis ton profil. Ton objectif est piloté par le rythme visé (% du
        poids / semaine) : le déficit (sèche) ou le surplus (prise de masse) s'ajuste
        tout seul à chaque pesée.
      </HelpHint>

      {/* 3 chiffres clés — lecture seule */}
      <div className="grid grid-cols-3 gap-2">
        <Info label="Au repos"     value={fmtKcal(restingBmr)}  hint="BMR" />
        <Info label="Maintenance"  value={fmtKcal(maintenance)} hint="TDEE" />
        <Info label="Cible"        value={fmtKcal(targetKcal)} accent
              hint={targetKcal - maintenance === 0 ? 'maintien' : `${targetKcal - maintenance > 0 ? '+' : ''}${targetKcal - maintenance} kcal`} />
      </div>

      {/* Sèche / Maintien / Prise de masse */}
      <div className="grid grid-cols-3 gap-2">
        {([
          ['cut', 'Sèche'],
          ['maintain', 'Maintien'],
          ['bulk', 'Prise de masse']
        ] as const).map(([m, txt]) => (
          <button
            key={m}
            onClick={() => chooseMode(m)}
            className={[
              'px-2 py-2.5 rounded-xl tap transition-colors text-sm font-semibold leading-tight',
              mode === m ? 'bg-brand text-white' : 'bg-surface-hi text-text active:bg-surface'
            ].join(' ')}
          >
            {txt}
          </button>
        ))}
      </div>

      {/* Réglage du rythme (sèche OU prise de masse) */}
      {mode !== 'maintain' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Gauge size={14} className="text-brand" />
              <span className="text-sm font-semibold">{isBulk ? 'Rythme de prise visé' : 'Rythme de perte visé'}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums">{rate.toFixed(2)} %/sem</span>
          </div>

          {/* Raccourcis dans la zone usuelle */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            {cfg.shortcuts.map((r) => (
              <button
                key={r}
                onClick={() => pickRate(r)}
                className={[
                  'px-2 py-1.5 rounded-lg text-xs font-semibold tap transition-colors',
                  Math.abs(rate - r) < 1e-6 ? 'bg-brand text-white' : 'bg-surface-hi text-text-muted active:bg-surface'
                ].join(' ')}
              >
                {fmtPct(r)} %
              </button>
            ))}
          </div>

          <input
            type="range"
            min={cfg.min}
            max={cfg.max}
            step={cfg.step}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            onPointerUp={commitSlider}
            onKeyUp={commitSlider}
            className="w-full accent-brand"
            aria-label={isBulk ? 'Rythme de prise en % du poids par semaine' : 'Rythme de perte en % du poids par semaine'}
          />
          <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
            <span>{fmtPct(cfg.min)} % (lent)</span>
            <span>{fmtPct(cfg.max)} % {isBulk ? '(max lean)' : '(max sûr)'}</span>
          </div>

          <p className="text-xs text-text-muted mt-1.5">
            ≈ <span className="font-semibold text-text">{isBulk ? '+' : ''}{kgPerWeek(rate).toFixed(2)} kg/sem</span>
            {' '}· {isBulk ? 'surplus' : 'déficit'} <span className="font-semibold text-text">{isBulk ? '+' : '−'}{kcalFromRate(rate)} kcal/j</span>
            {' '}→ cible {fmtKcal(targetForRate(rate))}/j.
            {inRecBand
              ? <span className="text-success"> Adapté à ton {bfLabel} ({fmtPct(rec.min)}–{fmtPct(rec.max)} %/sem) ✓</span>
              : aboveRecBand
              ? <span className="text-warn"> Au-dessus de la fourchette conseillée pour ton {bfLabel} ({fmtPct(rec.min)}–{fmtPct(rec.max)} %) : {isBulk ? 'risque de prise de gras' : 'risque muscle'}.</span>
              : <span className="text-text-muted"> Sous la fourchette conseillée ({fmtPct(rec.min)}–{fmtPct(rec.max)} %) : {isBulk ? 'prise très prudente' : 'sèche prudente'}.</span>}
          </p>

          {deficitCapped && (
            <div className="mt-2 rounded-xl bg-warn/10 border border-warn/30 px-3 py-2.5 text-xs space-y-1">
              <div className="font-semibold text-warn">🛡️ Déficit plafonné pour préserver ton muscle</div>
              <p className="text-text-muted">
                Ce rythme demande un déficit de <span className="font-semibold text-text">−{requestedDeficit} kcal</span>,
                qui rapprocherait ta cible de ton métabolisme de base. À ce niveau, une sèche
                fait fondre le muscle, pas seulement le gras. On applique au plus{' '}
                <span className="font-semibold text-text">−{cappedDeficit} kcal</span> ({Math.round(maxFrac * 100)} % de
                ta maintenance), soit une cible plancher de{' '}
                <span className="font-semibold text-text">{fmtKcal(muscleFloor)}</span>.
                Pour perdre plus vite, augmente la dépense (cardio, +1000-2000 pas/jour) plutôt
                que de couper l'apport.
              </p>
            </div>
          )}

          {isBulk && recommendedGainRange(profile).cutFirst && (
            <p className="text-xs text-warn mt-1">
              ⚠ Ton %MG est déjà élevé : une prise de masse ajouterait surtout du gras.
              Envisage une sèche d'abord, puis reviens en prise de masse une fois plus sec.
            </p>
          )}
        </div>
      )}

      {/* Pause diète (vacances / semaine sans pesée fiable) */}
      <ToggleRow
        label="Pause diète (vacances)"
        checked={paused}
        onToggle={async () => {
          haptic('selection');
          await setDietPaused(!paused);
          toast(paused ? 'Sèche reprise' : 'Pause diète activée : cible à la maintenance', 'success');
        }}
        description={paused
          ? 'Active : cible tenue à ta maintenance, aucun recalcul sur tes pesées. Reprends quand tu veux.'
          : 'Tiens la cible à ta maintenance et suspend le recalcul auto quand tu ne peux pas suivre (vacances, pas de pesée fiable). Ton objectif est conservé pour la reprise.'}
      />

      <HelpHint>
        Tu peux changer d'objectif à tout moment : la cible et les portions du plan se
        recalibrent dès le lendemain (une journée entamée n'est jamais réécrite). En sèche,
        au-delà de 1 %/sem la perte attaque le muscle (Garthe 2011) ; en prise de masse,
        au-delà de ~0,5 %/sem le surplus part surtout en gras. Les garde-fous de la cible
        (anti-emballement, plancher de sécurité) se règlent dans l'onglet Réglages.
      </HelpHint>
    </CollapsibleCard>
  );
}

/** Borne une valeur de rythme dans les limites du mode. */
function clamp(cfg: { min: number; max: number }, r: number): number {
  return Math.min(cfg.max, Math.max(cfg.min, r));
}

function Info({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={['rounded-xl px-3 py-2', accent ? 'bg-brand/15 border border-brand/40' : 'bg-surface-hi'].join(' ')}>
      <div className="text-[10px] uppercase text-text-muted">{label}</div>
      <div className="font-semibold text-sm mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
    </div>
  );
}
