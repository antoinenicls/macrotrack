import { useRef, useState } from 'react';
import { CollapsibleCard, Button, HelpHint } from '@/components/ui';
import { Download, Upload, RotateCcw, HardDrive } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useUIStore } from '@/store/uiStore';
import { useProfileStore } from '@/store/profileStore';
import { downloadBackup, importBackup } from '@/services/backup';
import { wipeAll } from '@/services/seed';
import { useFoodsStore } from '@/store/foodsStore';
import { useWeightStore } from '@/store/weightStore';
import { useLogStore } from '@/store/logStore';

/**
 * Sauvegarde et données : export / import d'un fichier de sauvegarde, et reset complet.
 */
export function DataPanel() {
  const toast = useUIStore((s) => s.toast);
  const reloadProfile = useProfileStore((s) => s.load);
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const reloadFoods = useFoodsStore((s) => s.load);
  const reloadWeight = useWeightStore((s) => s.load);
  const reloadLog = useLogStore((s) => s.loadForDate);
  const date = useLogStore((s) => s.date);

  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const reloadAll = async () => {
    await Promise.all([reloadProfile(), reloadFoods(), reloadWeight(), reloadLog(date)]);
  };

  const onExport = async () => {
    await downloadBackup();
    if (settings) await saveSettings({ ...settings, lastBackupAt: Date.now(), backupSnoozeUntil: undefined });
    toast('Sauvegarde enregistrée dans tes téléchargements', 'success');
  };

  const onImport = async (file: File) => {
    setBusy(true);
    try {
      const text = await file.text();
      const res = await importBackup(text);
      if (res.ok) { await reloadAll(); toast('Import réussi', 'success'); }
      else toast(res.error, 'error');
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!confirm('Supprimer toutes les données ? Cette action est irréversible.')) return;
    setBusy(true);
    await wipeAll();
    await reloadAll();
    setBusy(false);
    toast('Données réinitialisées', 'success');
  };

  return (
    <CollapsibleCard
      title="Sauvegarde et données"
      icon={<HardDrive size={18} />}
      summary={settings?.lastBackupAt
        ? `Dernière sauvegarde le ${format(settings.lastBackupAt, 'd MMMM yyyy', { locale: fr })}`
        : 'Aucune sauvegarde pour l\'instant'}
    >
      <div>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" leadingIcon={<Download size={16} />} onClick={onExport}>Exporter</Button>
          <Button variant="secondary" leadingIcon={<Upload size={16} />} onClick={() => fileRef.current?.click()} disabled={busy}>Importer</Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <HelpHint>Sauvegarde toutes tes données dans un fichier (à garder avant un reset ou changement d'iPhone).</HelpHint>
      </div>

      <div>
        <Button variant="danger" block leadingIcon={<RotateCcw size={16} />} onClick={onReset} disabled={busy}>
          Réinitialiser
        </Button>
        <HelpHint>Tout efface. Irréversible, pense à exporter avant.</HelpHint>
      </div>
    </CollapsibleCard>
  );
}
