import { Ring } from '@/components/ui';
import type { MacroTargets } from '@/types';
import type { MacroTotals } from '@/lib/nutrition';

interface Props {
  totals: MacroTotals;
  targets: MacroTargets;
}

/**
 * Affiche Protéines / Glucides / Lipides — pas les calories, qui sont sur la
 * progress bar principale juste en dessous (évite la redondance et laisse
 * de la place aux 3 anneaux pour respirer).
 */
export function MacroRings({ totals, targets }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4 place-items-center">
      <Ring value={totals.protein} max={targets.protein} color="#ef4444" label="Protéines" sublabel={`/${targets.protein}g`} size={76} stroke={8} />
      <Ring value={totals.carbs}   max={targets.carbs}   color="#f59e0b" label="Glucides"  sublabel={`/${targets.carbs}g`}  size={76} stroke={8} />
      <Ring value={totals.fat}     max={targets.fat}     color="#a855f7" label="Lipides"   sublabel={`/${targets.fat}g`}    size={76} stroke={8} />
    </div>
  );
}
