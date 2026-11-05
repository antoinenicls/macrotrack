import { useState } from 'react';
import { Card, Button } from '@/components/ui';
import { ShieldAlert } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useWeightStore } from '@/store/weightStore';
import { useUIStore } from '@/store/uiStore';
import { downloadBackup } from '@/services/backup';

const DAY = 86_400_000;
/** Intervalle de rappel de sauvegarde : 2 semaines. */
export const BACKUP_INTERVAL_DAYS = 14;
const SNOOZE_DAYS = 1;

/**
 * Rappel de sauvegarde bi-hebdomadaire. Les données vivent dans IndexedDB (local) :
 * un nettoyage Safari / changement d'appareil = tout perdu. Comme iOS interdit le
 * téléchargement automatique en arrière-plan, on propose un export en 1 tap quand
 * la sauvegarde est due (≥ 14 j depuis la dernière). Le fichier (JSON, quelques Ko)
 * part dans les Téléchargements de l'iPhone.
 */
export function BackupReminder() {
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const weights = useWeightStore((s) => s.weights);
  const toast = useUIStore((s) => s.toast);
  const [busy, setBusy] = useState(false);

  if (!settings) return null;
  // Rien à sauvegarder tant qu'il n'y a pas de données réelles.
  if (weights.length === 0) return null;

  const now = Date.now();
  const snoozed = (settings.backupSnoozeUntil ?? 0) > now;
  const last = settings.lastBackupAt;
  const due = !snoozed && (last == null || now - last >= BACKUP_INTERVAL_DAYS * DAY);
  if (!due) return null;

  const onSave = async () => {
    setBusy(true);
    try {
      await downloadBackup();
      await saveSettings({ ...settings, lastBackupAt: Date.now(), backupSnoozeUntil: undefined });
      toast('Sauvegarde enregistrée dans tes téléchargements', 'success');
    } finally {
      setBusy(false);
    }
  };

  const onSnooze = async () => {
    await saveSettings({ ...settings, backupSnoozeUntil: Date.now() + SNOOZE_DAYS * DAY });
  };

  return (
    <Card className="space-y-3 border-warn/40 bg-warn/5">
      <div className="flex gap-3 items-start">
        <ShieldAlert size={20} className="text-warn shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-text-muted">Sauvegarde recommandée</div>
          <p className="text-sm mt-0.5">Pense à enregistrer une copie de tes données.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" className="col-span-2" onClick={onSave} disabled={busy}>Sauvegarder</Button>
        <Button size="sm" variant="secondary" onClick={onSnooze} disabled={busy}>Plus tard</Button>
      </div>
    </Card>
  );
}
