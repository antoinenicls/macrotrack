import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, Button, SegmentedControl, EmptyState } from '@/components/ui';
import { Plus } from 'lucide-react';
import { useWeightStore } from '@/store/weightStore';
import { buildTrend, buildValueTrend, trendStats } from '@/lib/trend';
import { fmtKg, fmtDelta, fmtPct } from '@/lib/format';
import { todayKey, parseDayKey, differenceInCalendarDays } from '@/lib/dates';
import { TrendChart, TREND_CHART_COLORS } from './TrendChart';
import { WeightHistory } from './WeightHistory';
import { GoalCard } from './GoalCard';
import { WeighInSheet } from './WeighInSheet';

type Range = '7' | '30' | '90' | 'all';

/** Relie les courbes poids et masse grasse : le curseur glisse au même jour sur les deux. */
const CHART_SYNC_ID = 'weight-page';

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: '7', label: 'Semaine' },
  { value: '30', label: 'Mois' },
  { value: '90', label: '3 mois' },
  { value: 'all', label: 'Tout' }
];

const RANGE_LABEL: Record<Range, string> = {
  '7': '7 jours',
  '30': '30 jours',
  '90': '3 mois',
  all: 'depuis le début'
};

export function WeightPage() {
  const weights = useWeightStore((s) => s.weights);

  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<Range>('30');

  const stats = trendStats(weights);
  const today = todayKey();
  const todayEntry = weights.find((w) => w.date === today);

  // Nombre de jours couverts par la plage sélectionnée (« Tout » = depuis la 1re pesée).
  const days = useMemo(() => {
    if (range !== 'all') return Number(range);
    if (weights.length === 0) return 30;
    const earliest = weights.reduce((a, b) => (a.date < b.date ? a : b)).date;
    return Math.max(7, differenceInCalendarDays(new Date(), parseDayKey(earliest)) + 1);
  }, [range, weights]);

  // Fenêtre de lissage plus courte sur les plages courtes (sinon la moyenne 7 j aplatit tout).
  const smoothWindow = days <= 14 ? 3 : 7;

  const weightData = useMemo(() => buildTrend(weights, days, smoothWindow), [weights, days, smoothWindow]);

  const bfPoints = useMemo(
    () => weights.filter((w) => w.bodyFatPct != null).map((w) => ({ date: w.date, value: w.bodyFatPct! })),
    [weights]
  );
  const bfData = useMemo(() => buildValueTrend(bfPoints, days, smoothWindow), [bfPoints, days, smoothWindow]);
  const hasBf = bfPoints.length > 0;

  // Dernière masse grasse renseignée (peut dater d'avant aujourd'hui).
  const latestBf = useMemo(() => {
    if (bfPoints.length === 0) return null;
    return bfPoints.reduce((a, b) => (a.date > b.date ? a : b)).value;
  }, [bfPoints]);

  return (
    <div className="space-y-4 px-5 pb-5">
      <PageHeader
        title="Poids"
        subtitle="Suivi quotidien"
        right={
          <Button
            size="sm"
            className="shrink-0"
            leadingIcon={<Plus size={16} />}
            onClick={() => setOpen(true)}
          >
            Ajouter
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Actuel"    value={stats.latestKg != null ? fmtKg(stats.latestKg) : '–'} />
          <Stat label="Tendance"  value={stats.weeklyKgPerWeek != null ? `${fmtDelta(stats.weeklyKgPerWeek)}/sem` : '–'} />
          <Stat label="Masse grasse" value={latestBf != null ? fmtPct(latestBf) : '–'} />
        </div>
      </Card>

      <SegmentedControl options={RANGE_OPTIONS} value={range} onChange={setRange} />

      <Card>
        <h3 className="font-semibold mb-1">Poids · {RANGE_LABEL[range]}</h3>
        <ChartLegend rawLabel="Pesée brute" avgLabel={`Moyenne mobile ${smoothWindow}j`} />
        <TrendChart data={weightData} unit="kg" decimals={2} domainPad={0.5} rawLabel="Pesée" avgLabel={`Moy. ${smoothWindow}j`} syncId={CHART_SYNC_ID} />
      </Card>

      <Card>
        <h3 className="font-semibold mb-1">Masse grasse · {RANGE_LABEL[range]}</h3>
        {hasBf ? (
          <>
            <ChartLegend rawLabel="Mesure brute" avgLabel={`Moyenne mobile ${smoothWindow}j`} />
            <TrendChart data={bfData} unit="%" decimals={1} domainPad={0.3} rawLabel="Mesure" avgLabel={`Moy. ${smoothWindow}j`} syncId={CHART_SYNC_ID} />
          </>
        ) : (
          <div className="mt-2">
            <EmptyState
              title="Aucune mesure de masse grasse"
              description="Ajoute le % masse grasse lors d'une pesée (balance à impédance) pour voir sa courbe."
            />
          </div>
        )}
      </Card>

      <WeightHistory />
      <GoalCard />

      <WeighInSheet
        open={open}
        onClose={() => setOpen(false)}
        date={today}
        initialKg={todayEntry?.kg}
        initialBodyFatPct={todayEntry?.bodyFatPct}
      />
    </div>
  );
}

function ChartLegend({ rawLabel, avgLabel }: { rawLabel: string; avgLabel: string }) {
  return (
    <div className="flex items-center gap-4 mb-2 text-xs text-text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3.5 h-[3px] rounded-full" style={{ backgroundColor: TREND_CHART_COLORS.raw }} />
        {rawLabel}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-3.5 h-[3px] rounded-full" style={{ backgroundColor: TREND_CHART_COLORS.avg }} />
        {avgLabel}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-text-muted">{label}</div>
      <div className="text-base font-semibold mt-0.5">{value}</div>
    </div>
  );
}
