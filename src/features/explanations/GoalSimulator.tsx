import { useEffect, useState } from 'react';
import { SegmentedControl } from '@/components/ui';
import { fmtKcal } from '@/lib/format';
import { haptic } from '@/lib/haptic';

/** ~7700 kcal stockées par kg de masse corporelle (idem coach). */
const KCAL_PER_KG = 7700;

/**
 * INTENSITÉ simulée, relative à la direction courante. « Douce / Modérée / Forte » n'ont
 * de sens que rapportées à l'objectif : en sèche ce sont des déficits, en prise de masse
 * des surplus. Les figer sur des déficits appliquait une sèche à quelqu'un en prise.
 */
type PreviewGoal = 'maintain' | 'soft' | 'mid' | 'hard';
const PREVIEW_LABEL: Record<PreviewGoal, string> = {
  maintain: 'Maintien', soft: 'Douce', mid: 'Modérée', hard: 'Forte'
};
/** Déficit SIGNÉ simulé (positif = déficit/sèche, négatif = surplus/prise). */
const PREVIEW_DEFICIT: Record<'cut' | 'bulk', Record<PreviewGoal, number>> = {
  cut:  { maintain: 0, soft: 300, mid: 400, hard: 500 },
  bulk: { maintain: 0, soft: -150, mid: -250, hard: -400 }
};

/** Intensité correspondant au déficit/surplus courant (sert à pré-sélectionner). */
function deficitToPreview(d: number): PreviewGoal {
  const mag = Math.abs(d);
  if (mag === 0) return 'maintain';
  if (d > 0) return mag <= 300 ? 'soft' : mag <= 400 ? 'mid' : 'hard';
  return mag <= 200 ? 'soft' : mag <= 300 ? 'mid' : 'hard';
}

/** Simulateur d'objectif : n'enregistre rien, montre seulement l'effet d'une intensité. */
export function GoalSimulator({ maintenance, deficit, isBulk }: { maintenance: number; deficit: number; isBulk: boolean }) {
  const [goal, setGoal] = useState<PreviewGoal>(() => deficitToPreview(deficit));
  useEffect(() => { setGoal(deficitToPreview(deficit)); }, [deficit]);

  const d = PREVIEW_DEFICIT[isBulk ? 'bulk' : 'cut'][goal];
  const target = maintenance - d;
  const kgPerWeek = (d * 7) / KCAL_PER_KG;

  return (
    <div className="rounded-2xl border border-border p-3 space-y-2.5">
      <div className="text-[13px] font-semibold text-text-muted">
        <span aria-hidden>🧪 </span>Simulateur · {isBulk ? 'prise de masse' : 'sèche'} (ne change rien à ta diète)
      </div>
      <SegmentedControl<PreviewGoal>
        value={goal}
        onChange={(g) => { haptic('selection'); setGoal(g); }}
        options={(Object.keys(PREVIEW_LABEL) as PreviewGoal[]).map((g) => ({ value: g, label: PREVIEW_LABEL[g] }))}
      />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[15px]" aria-live="polite">
        <span className="text-text-muted">
          {d === 0 ? 'Ni déficit ni surplus' : d > 0 ? `− ${d} kcal/j` : `+ ${-d} kcal/j`}
        </span>
        <span className="font-semibold">
          {fmtKcal(target)}/j · {kgPerWeek === 0
            ? 'poids stable'
            : kgPerWeek > 0
            ? `~−${kgPerWeek.toFixed(2)} kg/sem`
            : `~+${Math.abs(kgPerWeek).toFixed(2)} kg/sem`}
        </span>
      </div>
    </div>
  );
}
