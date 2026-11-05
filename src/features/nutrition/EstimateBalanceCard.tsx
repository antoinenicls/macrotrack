import { Card } from '@/components/ui';
import { Scale } from 'lucide-react';
import { MEAL_LABEL } from '@/types';
import { fmtKcal } from '@/lib/format';
import { PROTEIN_GAP_ALERT_G, type EstimateRebalance } from '@/lib/estimateRebalance';

interface Props {
  rebalance: EstimateRebalance;
  /** Calories retirées de cette journée pour un repas estimé des jours précédents. */
  carryIn: number;
  /** Calories qui seront retirées de chacun des jours suivants (0 = rien de reporté). */
  carryOut: number;
  /** Nombre de jours de report réglé (0 = report désactivé). */
  carryDays: number;
}

/**
 * Bilan d'un repas estimé : écart vs le repas prévu, comment le reste de la journée a été
 * recalé et ce qui est reporté sur les jours suivants (cf. lib/estimateRebalance). Montre
 * aussi, le lendemain, le report reçu. Masqué quand il n'y a rien de tout ça.
 */
export function EstimateBalanceCard({ rebalance, carryIn, carryOut, carryDays }: Props) {
  const { deltaKcal, adjustedKcal, uncompensatedKcal, proteinGapG, adjustedSlots } = rebalance;
  const proteinAlert = proteinGapG >= PROTEIN_GAP_ALERT_G;
  const hasEstimate = adjustedSlots.length > 0 || uncompensatedKcal > 0 || proteinAlert;
  if (!hasEstimate && carryIn <= 0) return null;

  const slots = adjustedSlots.map((s) => MEAL_LABEL[s].toLowerCase()).join(', ');
  if (!hasEstimate) {
    return (
      <Card className="!p-4 border-brand/40 bg-brand/5">
        <div className="flex gap-3">
          <span className="shrink-0 rounded-2xl p-2.5 bg-brand/15 text-brand h-fit">
            <Scale size={18} />
          </span>
          <div className="flex-1 min-w-0 space-y-1 text-xs">
            <div className="text-sm font-semibold">Report d'un repas estimé : −{fmtKcal(carryIn)}</div>
            <div className="text-text-muted">
              Féculents et gras un peu réduits pour rattraper l'écart des jours précédents. Protéines inchangées.
            </div>
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="!p-4 border-brand/40 bg-brand/5">
      <div className="flex gap-3">
        <span className="shrink-0 rounded-2xl p-2.5 bg-brand/15 text-brand h-fit">
          <Scale size={18} />
        </span>
        <div className="flex-1 min-w-0 space-y-1 text-xs">
          <div className="text-sm font-semibold">
            Repas estimé : {deltaKcal >= 0 ? '+' : '−'}{fmtKcal(Math.abs(deltaKcal))} vs prévu
          </div>
          {adjustedSlots.length > 0 && (
            <div className="text-text-muted">
              {adjustedKcal < 0 ? 'Féculents et gras réduits' : 'Féculents et gras augmentés'} sur {slots}{' '}
              ({adjustedKcal < 0 ? '−' : '+'}{fmtKcal(Math.abs(adjustedKcal))}), protéines inchangées.
              {adjustedKcal > 0 && ' Seule la moitié de l\'écart est rajoutée : un repas dehors est souvent plus riche qu\'il n\'y paraît.'}
            </div>
          )}
          {uncompensatedKcal > 0 && (
            <div className="font-medium" style={{ color: '#B45309' }}>
              {carryOut > 0
                ? <>+{fmtKcal(uncompensatedKcal)} ne rentrent pas dans la journée : reportés sur {carryDays > 1 ? `les ${carryDays} prochains jours` : 'demain'} (−{fmtKcal(carryOut)} par jour). Ou ~1 h de marche ≈ 300 kcal.</>
                : carryDays <= 0
                  ? <>+{fmtKcal(uncompensatedKcal)} non compensables (report désactivé dans les réglages) : pas grave, c'est la semaine qui compte.</>
                  : <>+{fmtKcal(uncompensatedKcal)} non compensables, trop peu pour être reportés : pas grave, c'est la semaine qui compte.</>}
            </div>
          )}
          {carryIn > 0 && (
            <div className="text-text-muted">Report des jours précédents inclus : −{fmtKcal(carryIn)}.</div>
          )}
          {proteinAlert && (
            <div className="font-medium" style={{ color: '#DB2777' }}>
              Il te manque ~{proteinGapG} g de protéines vs prévu : ajoute un skyr, du fromage blanc ou un shaker de whey.
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
