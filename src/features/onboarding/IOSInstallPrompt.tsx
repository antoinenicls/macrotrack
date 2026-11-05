import { useEffect, useState } from 'react';
import { Sheet, Button } from '@/components/ui';
import { Share, PlusSquare } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';

/**
 * Détecte Safari iOS hors mode standalone.
 * Affiche un bottom-sheet expliquant "Ajouter à l'écran d'accueil".
 * Mémorise la date de dismiss → on ne re-prompt pas avant 14 jours.
 */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) && !/CriOS|FxiOS/i.test(ua);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS specifique
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function IOSInstallPrompt() {
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!settings) return;
    if (!isIOS() || isStandalone()) return;
    const dismissed = settings.iosPromptDismissedAt;
    const TWO_WEEKS = 14 * 24 * 3600 * 1000;
    if (dismissed && Date.now() - dismissed < TWO_WEEKS) return;
    // Petit délai pour ne pas se déclencher pendant le 1er paint
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [settings]);

  const dismiss = async () => {
    setOpen(false);
    if (settings) {
      await saveSettings({ ...settings, iosPromptDismissedAt: Date.now() });
    }
  };

  return (
    <Sheet open={open} onClose={dismiss} title="Installer l'app">
      <div className="space-y-4 pb-2">
        <p className="text-sm text-text-muted">
          Pour une expérience optimale, ajoute MacroTrack à ton écran d'accueil. Elle s'ouvrira en plein écran, comme une app native.
        </p>
        <ol className="space-y-3">
          <li className="flex gap-3 items-start">
            <span className="bg-surface-hi rounded-lg p-2 text-brand"><Share size={18} /></span>
            <div>
              <div className="font-medium">1. Appuie sur "Partager"</div>
              <div className="text-xs text-text-muted">Icône carré + flèche, dans la barre Safari.</div>
            </div>
          </li>
          <li className="flex gap-3 items-start">
            <span className="bg-surface-hi rounded-lg p-2 text-brand"><PlusSquare size={18} /></span>
            <div>
              <div className="font-medium">2. "Sur l'écran d'accueil"</div>
              <div className="text-xs text-text-muted">Fais défiler le menu vers le bas si besoin.</div>
            </div>
          </li>
        </ol>
        <Button block variant="secondary" onClick={dismiss}>Plus tard</Button>
      </div>
    </Sheet>
  );
}
