import { useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, ProgressBar } from '@/components/ui';
import { MacroRings } from './MacroRings';
import { TodayChecklist } from './TodayChecklist';
import { CoachCard } from './CoachCard';
import { RecoveryCard } from './RecoveryCard';
import { RefeedCard } from './RefeedCard';
import { TrainingDayCard } from './TrainingDayCard';
import { WeeklyReviewCard } from './WeeklyReviewCard';
import { BackupReminder } from './BackupReminder';
import { useLogStore } from '@/store/logStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { effectiveTargets, macrosForItem, sumMacros } from '@/lib/nutrition';
import { formatHumanDate, todayKey } from '@/lib/dates';
import { fmtKcal } from '@/lib/format';
import { getTemplateForDate } from '@/lib/templates';
import { carryOverFor, carrySettingsOf, planKcal, reduceTargets } from '@/lib/estimateRebalance';

/**
 * Accueil "chef cuistot" :
 *  - Tu vois ton avancement de la journée en un coup d'œil
 *  - L'app te dit ce qu'il y a à faire (pesée, menu du jour, séance)
 *  - Pas de gestion manuelle ici — tu coches ce que tu as mangé dans Repas, c'est tout.
 *
 * Ordre pensé pour tenir SANS SCROLL sur un téléphone : calories + macros, « À faire
 * aujourd'hui » (pesée + menu), « Séance aujourd'hui ? ». Les rappels occasionnels
 * (sauvegarde, bilan hebdo) et le coach viennent ensuite.
 */
export function DashboardPage() {
  const date = useLogStore((s) => s.date);
  const meals = useLogStore((s) => s.meals);
  const setDate = useLogStore((s) => s.setDate);
  const byId = useFoodsStore((s) => s.byId);
  const foods = useFoodsStore((s) => s.foods);
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);

  useEffect(() => {
    if (date !== todayKey()) setDate(todayKey());
  }, [date, setDate]);

  const totals = useMemo(() => {
    const allItems = meals.flatMap((m) => m.items);
    return sumMacros(allItems.map((it) => macrosForItem(byId(it.foodId), it)));
  }, [meals, byId, foods.length]);

  if (!profile || !settings) return null;

  // Cible du jour allégée d'un éventuel report de repas estimé (cf. lib/estimateRebalance).
  const carryIn = carryOverFor(todayKey(), settings.estimateSurplus, planKcal(getTemplateForDate(todayKey(), settings), byId), carrySettingsOf(settings));
  const targets = reduceTargets(effectiveTargets(profile), carryIn);
  const remaining = Math.max(0, targets.kcal - totals.kcal);

  return (
    <div className="space-y-3 px-5 pb-5">
      <PageHeader subtitle={formatHumanDate(date)} title="Aujourd'hui" />

      {/* Calories (le chiffre clé, en tête) puis les 3 macros */}
      <Card className="!p-4 space-y-3">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm" style={{ color: '#111827' }}>
              <span className="text-2xl font-extrabold tabular-nums">{Math.round(totals.kcal)}</span>
              <span style={{ color: '#6B7280' }}> / {fmtKcal(targets.kcal)}</span>
            </span>
            <span className="text-xs font-medium" style={{ color: '#6B7280' }}>
              {remaining > 0
                ? <>Reste <span className="font-bold" style={{ color: '#111827' }}>{fmtKcal(remaining)}</span></>
                : <>Cible atteinte 🎯</>}
            </span>
          </div>
          <ProgressBar value={totals.kcal} max={targets.kcal} color="rgb(var(--c-brand))" height={10} />
          {carryIn > 0 && (
            <div className="text-xs mt-1.5" style={{ color: '#6B7280' }}>
              Cible allégée de {fmtKcal(carryIn)} : report d'un repas estimé des jours précédents.
            </div>
          )}
        </div>
        <MacroRings totals={totals} targets={targets} />
      </Card>

      {/* Les actions du jour : pesée du matin + menu du jour (deux cartes) */}
      <TodayChecklist />

      {/* Séance du jour : bascule la collation en pré-training (jours d'entraînement variables) */}
      <TrainingDayCard />

      {/* Rappels occasionnels, sous l'essentiel pour ne pas le pousser hors écran */}
      <BackupReminder />
      <WeeklyReviewCard />

      {/* Coach : maintenance réelle mesurée + reco de cible */}
      <CoachCard />

      {/* Récupération : n'apparaît qu'en Maintien post-sèche, pour inviter à reprendre */}
      <RecoveryCard />

      {/* Jour de recharge : n'apparaît qu'en sèche quand un refeed est pertinent (%MG bas/modéré) */}
      <RefeedCard />
    </div>
  );
}
