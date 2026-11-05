import { useEffect, useState } from 'react';
import { Button, NumberInput, Sheet } from '@/components/ui';
import { useWeightStore } from '@/store/weightStore';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Jour concerné (YYYY-MM-DD). */
  date: string;
  /** Valeurs pré-remplies quand on rouvre pour éditer une pesée existante. */
  initialKg?: number;
  initialBodyFatPct?: number;
}

/**
 * Feuille de saisie « Pesée du matin » partagée (dashboard + onglet Poids).
 * Poids obligatoire ; masse grasse OPTIONNELLE (renseignée seulement les jours avec
 * une balance à impédance). La dernière MG connue calibre le profil — cf. weightStore.
 */
export function WeighInSheet({ open, onClose, date, initialKg, initialBodyFatPct }: Props) {
  const upsertWeight = useWeightStore((s) => s.upsertWeight);
  const toast = useUIStore((s) => s.toast);
  // Suivi %MG désactivé (élève sans balance à impédance) → on masque la saisie.
  const useBf = useProfileStore((s) => s.profile?.useBodyFat) !== false;
  const [kg, setKg] = useState<number | ''>('');
  const [bf, setBf] = useState<number | ''>('');

  // Ré-initialise les champs à chaque ouverture (nouvelle saisie ou édition).
  useEffect(() => {
    if (open) {
      setKg(initialKg ?? '');
      setBf(initialBodyFatPct ?? '');
    }
  }, [open, initialKg, initialBodyFatPct]);

  const submit = async () => {
    if (typeof kg !== 'number') return;
    await upsertWeight(date, kg, typeof bf === 'number' ? bf : undefined);
    toast('Pesée enregistrée', 'success');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Pesée du matin">
      <div className="space-y-4">
        <NumberInput label="Poids" value={kg} onChange={setKg} suffix="kg" step={0.05} autoFocus />
        {useBf && (
          <NumberInput
            label="Masse grasse"
            hint="Optionnel, si ta balance la mesure"
            value={bf}
            onChange={setBf}
            suffix="%"
            step={0.1}
            min={0}
            max={60}
          />
        )}
        <Button block onClick={submit} disabled={typeof kg !== 'number'}>Enregistrer</Button>
      </div>
    </Sheet>
  );
}
