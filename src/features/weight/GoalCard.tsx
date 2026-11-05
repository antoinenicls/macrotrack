import { useEffect, useRef, useState } from 'react';
import { Card, NumberInput, ProgressBar } from '@/components/ui';
import { Flag } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useWeightStore } from '@/store/weightStore';
import { projectGoal } from '@/lib/trend';
import { fmtKg, fmtDelta } from '@/lib/format';
import { formatShortDate } from '@/lib/dates';

/**
 * Objectif de poids + projection d'atteinte (ETA) basée sur la tendance hebdo.
 * Le poids cible est stocké dans le profil ; la saisie est débouncée.
 */
export function GoalCard() {
  const profile = useProfileStore((s) => s.profile);
  const save = useProfileStore((s) => s.saveProfile);
  const weights = useWeightStore((s) => s.weights);

  const [goal, setGoal] = useState<number | ''>(profile?.goalWeightKg ?? '');
  const first = useRef(true);

  // Sauvegarde débouncée (on ignore le 1er render pour ne pas réécrire à l'identique).
  useEffect(() => {
    if (!profile) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => {
      save({ ...profile, goalWeightKg: typeof goal === 'number' ? goal : undefined });
    }, 400);
    return () => clearTimeout(t);
  }, [goal]);

  if (!profile) return null;

  const proj = typeof goal === 'number' ? projectGoal(weights, goal) : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <Flag size={16} className="text-brand" />
        <h3 className="font-semibold">Objectif</h3>
      </div>

      <NumberInput label="Poids cible" value={goal} onChange={setGoal} suffix="kg" step={0.1} />

      {proj && (
        proj.reached ? (
          <p className="text-sm text-success font-medium">🎯 Objectif atteint, bravo !</p>
        ) : (
          <div className="space-y-2">
            <ProgressBar value={proj.progress} max={1} color="#5b8cff" height={8} showOverflow={false} />
            <div className="grid grid-cols-3 gap-2 text-center">
              <Mini label="Restant" value={fmtKg(proj.remainingKg)} />
              <Mini label="Rythme" value={proj.weeklyKgPerWeek != null ? `${fmtDelta(proj.weeklyKgPerWeek)}/sem` : '–'} />
              <Mini label="Échéance" value={proj.etaDate ? formatShortDate(proj.etaDate) : '–'} />
            </div>
            <p className="text-xs text-text-muted text-center">
              {proj.onTrack && proj.weeksRemaining != null
                ? <>À ce rythme : objectif atteint dans ~{Math.round(proj.weeksRemaining)} semaine{Math.round(proj.weeksRemaining) > 1 ? 's' : ''}.</>
                : <>Ta tendance actuelle ne va pas vers ta cible : ajuste tes calories ou attends plus de pesées.</>}
            </p>
          </div>
        )
      )}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-text-muted">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{value}</div>
    </div>
  );
}
