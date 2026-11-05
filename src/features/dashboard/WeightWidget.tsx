import { Card } from '@/components/ui';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useWeightStore } from '@/store/weightStore';
import { trendStats } from '@/lib/trend';
import { fmtKg, fmtDelta } from '@/lib/format';
import { Link } from 'react-router-dom';

export function WeightWidget() {
  const weights = useWeightStore((s) => s.weights);
  const stats = trendStats(weights);

  const trendIcon =
    stats.weeklyKgPerWeek == null ? <Minus size={18} />
    : stats.weeklyKgPerWeek < -0.05 ? <TrendingDown size={18} className="text-success" />
    : stats.weeklyKgPerWeek > 0.05 ? <TrendingUp size={18} className="text-warn" />
    : <Minus size={18} />;

  return (
    <Link to="/weight" className="block">
      <Card className="flex items-center gap-3 active:bg-surface-hi">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-text-muted">Poids actuel</div>
          <div className="text-xl font-bold">
            {stats.latestKg != null ? fmtKg(stats.latestKg) : 'Aucune pesée'}
          </div>
          {stats.weeklyKgPerWeek != null && (
            <div className="text-xs text-text-muted mt-0.5">
              Tendance 7j : {fmtDelta(stats.weeklyKgPerWeek)} /sem
            </div>
          )}
        </div>
        <div className="bg-surface-hi rounded-xl p-2.5">{trendIcon}</div>
      </Card>
    </Link>
  );
}
