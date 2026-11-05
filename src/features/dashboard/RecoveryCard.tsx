import { Card, Button } from '@/components/ui';
import { HeartPulse } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { recoveryStatus } from '@/lib/coach';
import { recommendedRateRange } from '@/lib/nutrition';
import { haptic } from '@/lib/haptic';

/**
 * Carte « Récupération faite » : pendant de la pause diète, côté SORTIE. Quand on est en
 * Maintien après une sèche depuis ≥ 2 semaines, elle invite à relancer une sèche DOUCE
 * pour ne pas rester bloqué à maintenance et cesser de progresser. Un tap la reprend au
 * rythme prudent conseillé pour le %MG. N'apparaît que quand la récup est jugée faite.
 */
export function RecoveryCard() {
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const resumeCut = useProfileStore((s) => s.resumeCut);
  const toast = useUIStore((s) => s.toast);

  if (!profile || !settings) return null;

  const status = recoveryStatus({ recoveryStartedAt: settings.recoveryStartedAt });
  if (!status.onRecovery || !status.ready) return null;

  // Rythme de reprise = borne BASSE de la fourchette conseillée au %MG (sèche douce, la
  // plus protectrice du muscle). Ex : %MG modéré → 0,5 %/sem.
  const resumeRate = recommendedRateRange(profile).min;
  const fmtPct = (r: number) => r.toFixed(2).replace('.', ',');

  const resume = async () => {
    haptic('success');
    await resumeCut(resumeRate);
    toast(`Sèche douce reprise (${fmtPct(resumeRate)} %/sem)`, 'success');
  };

  return (
    <Card className={`space-y-2 ${status.overdue ? 'border-warn/40 bg-warn/5' : 'border-brand/20 bg-brand/5'}`}>
      <div className="flex gap-3 items-start">
        <HeartPulse size={20} className={`shrink-0 mt-0.5 ${status.overdue ? 'text-warn' : 'text-brand'}`} />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-text-muted">
            {status.overdue ? 'Récupération · reprends' : 'Récupération faite'}
          </div>
          <p className="text-sm mt-1 text-text-muted">{status.message}</p>
          <div className="mt-2">
            <Button size="sm" onClick={resume}>
              Reprendre ma sèche douce ({fmtPct(resumeRate)} %/sem)
            </Button>
          </div>
          <p className="text-[11px] mt-2 text-text-muted">
            Reprise au rythme le plus prudent pour ton %MG. Tu pourras l'ajuster dans
            Plan → Objectif → Mon objectif. Le plancher de préservation musculaire reste actif.
          </p>
        </div>
      </div>
    </Card>
  );
}
