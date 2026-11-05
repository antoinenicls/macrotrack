import { useEffect, useState, type ReactNode } from 'react';
import { Card, Button } from '@/components/ui';
import { CalendarCheck, TrendingDown, Gauge, ClipboardList, Flag, Coffee, Scissors } from 'lucide-react';
import type { Meal } from '@/types';
import { mealsRepo } from '@/services/repositories';
import { useWeightStore } from '@/store/weightStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useLogStore } from '@/store/logStore';
import { buildWeeklyReview, referenceTdeeForDrop } from '@/lib/coach';
import { smoothedBodyFatPct } from '@/lib/trend';
import { fmtKcal, fmtDelta } from '@/lib/format';
import { formatShortDate } from '@/lib/dates';

const DAY = 86_400_000;
/** Le bilan ne s'affiche qu'~1×/semaine (ou dès qu'il y a du nouveau à dire). */
export const WEEKLY_REVIEW_INTERVAL_DAYS = 7;

/**
 * Bilan hebdomadaire « comme un coach » : 1×/semaine, un récap de la semaine écoulée
 * (tendance, maintenance mesurée, assiduité de logging, objectif), sans aucune saisie.
 * S'affiche quand il est dû et se referme d'un tap sur « Vu ».
 */
export function WeeklyReviewCard() {
  const weights = useWeightStore((s) => s.weights);
  const byId = useFoodsStore((s) => s.byId);
  const foodsLen = useFoodsStore((s) => s.foods.length);
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const todayMeals = useLogStore((s) => s.meals);

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  useEffect(() => {
    let cancelled = false;
    mealsRepo.all().then((m) => { if (!cancelled) setAllMeals(m); });
    return () => { cancelled = true; };
  }, [todayMeals, foodsLen]);

  if (!profile || !settings) return null;
  // Pas de bilan tant qu'il n'y a pas un minimum de pesées dans l'historique.
  if (weights.length < 7) return null;

  const now = Date.now();
  const last = settings.lastWeeklyReviewAt ?? 0;
  const justReached = settings.goalReachedAt != null && now - settings.goalReachedAt < WEEKLY_REVIEW_INTERVAL_DAYS * DAY;
  const due = now - last >= WEEKLY_REVIEW_INTERVAL_DAYS * DAY || (justReached && last < settings.goalReachedAt!);
  if (!due) return null;

  // %MG lissé (garde-fous stables) et TDEE de référence CALIBRÉ sur le facteur d'activité gelé
  // en début de sèche : sans ça, la formule générique (BMR × 1,5) surestime la maintenance et
  // le détecteur d'adaptation métabolique déclencherait de fausses pauses diète (cf. R4).
  const bfSmoothed = profile.bodyFatPct != null ? smoothedBodyFatPct(weights) : null;
  const coachProfile = bfSmoothed != null ? { ...profile, bodyFatPct: bfSmoothed } : profile;
  const review = buildWeeklyReview(allMeals, byId, weights, {
    targetKcal: profile.targetKcal ?? null,
    deficitKcal: settings.deficitKcal ?? 400,
    mode: settings.goalMode,
    goalWeightKg: profile.goalWeightKg,
    goalReachedAt: settings.goalReachedAt,
    slowdownGuardEnabled: settings.slowdownGuardEnabled ?? true,
    cutStartedAt: settings.cutStartedAt,
    bulkStartedAt: settings.bulkStartedAt,
    sex: profile.sex,
    bodyFatPct: bfSmoothed ?? profile.bodyFatPct,
    formulaTdee: referenceTdeeForDrop(coachProfile, settings.cutBaselineFactor)
  });

  const onAck = async () => {
    await saveSettings({ ...settings, lastWeeklyReviewAt: Date.now() });
  };

  return (
    <Card className="space-y-3 border-brand/30 bg-brand/5">
      <div className="flex gap-3 items-start">
        <CalendarCheck size={20} className="text-brand shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-text-muted">Bilan de la semaine</div>
          <p className="text-sm mt-0.5 font-semibold">{review.headline}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Row icon={TrendingDown} label="Rythme">
          {review.weeklyRateKg == null
            ? 'pesées insuffisantes cette semaine'
            : <>{fmtDelta(review.weeklyRateKg, 'kg')}/sem · <span className="text-text-muted">{review.rateNote}</span></>}
        </Row>
        <Row icon={Gauge} label="Métabolisme">
          {review.measuredTdee != null
            ? <>maintenance mesurée ≈ <span className="font-semibold">{fmtKcal(review.measuredTdee)}</span></>
            : 'maintenance mesurée pas encore débloquée'}
          {review.targetKcal != null && <> · cible {fmtKcal(review.targetKcal)}</>}
        </Row>
        <Row icon={ClipboardList} label="Assiduité">{review.adherenceNote}</Row>
        {review.dietBreak.recommended && review.dietBreak.message && (
          <Row icon={Coffee} label="Pause diète">
            <span className={review.dietBreak.urgent ? 'text-warn' : 'text-text-muted'}>
              {review.dietBreak.message}
            </span>
          </Row>
        )}
        {review.miniCut.recommended && review.miniCut.message && (
          <Row icon={Scissors} label="Mini-cut">
            <span className={review.miniCut.urgent ? 'text-warn' : 'text-text-muted'}>
              {review.miniCut.message}
            </span>
          </Row>
        )}
        {review.goalRemainingKg != null && (
          <Row icon={Flag} label="Objectif">
            {review.goalJustReached
              ? 'atteint 🎯, tu es passé en maintien'
              : review.goalOnTrack && review.goalEtaDate
              ? <>reste {fmtDelta(-review.goalRemainingKg, 'kg').replace('-', '')} · ETA {formatShortDate(review.goalEtaDate)}</>
              : `reste ${review.goalRemainingKg.toFixed(1)} kg · tendance pas encore vers la cible`}
          </Row>
        )}
      </div>

      <Button size="sm" block variant="secondary" onClick={onAck}>Vu</Button>
    </Card>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof TrendingDown; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <Icon size={16} className="text-text-muted shrink-0 mt-0.5" />
      <div>
        <span className="text-text-muted">{label} : </span>
        {children}
      </div>
    </div>
  );
}
