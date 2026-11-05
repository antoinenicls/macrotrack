import { useState } from 'react';
import { Card } from '@/components/ui';
import { Dumbbell, Check } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { todayKey } from '@/lib/dates';
import { haptic } from '@/lib/haptic';

/**
 * Carte « Séance aujourd'hui ? » : les jours d'entraînement ne sont pas fixes, on déclare
 * la séance le jour même. Un tap → la collation devient le bloc pré-training (galettes de
 * riz + miel + banane), le reste du menu se ré-ajuste (mêmes calories et protéines).
 * Annulable ; revient au plan normal demain. Cf. lib/trainingDay, applyTrainingToday.
 *
 * Tient sur UNE ligne (icône · texte · action, centrés verticalement) pour rester visible
 * sur l'accueil sans scroll, juste sous « À faire aujourd'hui ».
 */
export function TrainingDayCard() {
  const settings = useProfileStore((s) => s.settings);
  const applyTrainingToday = useProfileStore((s) => s.applyTrainingToday);
  const clearTrainingToday = useProfileStore((s) => s.clearTrainingToday);
  const toast = useUIStore((s) => s.toast);
  const [busy, setBusy] = useState(false);

  if (!settings) return null;
  const today = todayKey();
  // Le marqueur seul ne suffit pas : un reset du plan (nouvelle rotation) peut avoir
  // effacé le snapshot du jour, auquel cas la séance n'est plus réellement appliquée.
  const active = settings.trainingDay?.date === today && !!settings.planSnapshots?.[today];

  const run = async (fn: () => Promise<void>, msg: string, tone: 'success' | 'info') => {
    setBusy(true);
    try {
      await fn();
      toast(msg, tone);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="!p-4" style={active ? { backgroundColor: '#EEF5FF', border: '1px solid rgba(0, 96, 223, 0.25)' } : undefined}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-2xl p-2.5" style={{ backgroundColor: 'rgba(0, 96, 223, 0.10)', color: '#0060DF' }}>
          {active ? <Check size={20} strokeWidth={2.5} /> : <Dumbbell size={20} />}
        </span>
        <div className="flex-1 min-w-0">
          {/* Espace insécable avant « ? » : le point d'interrogation ne part jamais seul à la ligne. */}
          {/* Textes volontairement COURTS pour tenir chacun sur une ligne sans être coupés. */}
          <div className="text-sm font-semibold leading-tight">
            {active ? 'Séance prévue' : 'Séance aujourd’hui ?'}
          </div>
          <div className="text-xs text-text-muted mt-0.5">
            {active ? 'Collation pré-training' : 'Galettes, miel, banane'}
          </div>
        </div>
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => { haptic('light'); void run(clearTrainingToday, 'Séance annulée : collation habituelle rétablie.', 'info'); }}
            className="shrink-0 h-9 px-3 rounded-xl text-sm font-medium disabled:opacity-40 tap active:opacity-70"
            style={{ backgroundColor: '#FFFFFF', color: '#374151', border: '1px solid rgba(0, 96, 223, 0.25)' }}
          >
            Annuler
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => { haptic('selection'); void run(applyTrainingToday, '🏋️ Séance ajoutée : ta collation passe en pré-training.', 'success'); }}
            className="shrink-0 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-brand active:bg-brand/80 disabled:opacity-40 tap"
          >
            Oui
          </button>
        )}
      </div>
    </Card>
  );
}
