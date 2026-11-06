import { useEffect, useState } from 'react';
import { Sheet, Button, Card } from '@/components/ui';
import { ChevronRight, Share, PlusSquare, Smartphone } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';

/**
 * Détecte Safari iOS hors mode standalone.
 * Affiche un bottom-sheet expliquant "Ajouter à l'écran d'accueil".
 * Mémorise la date de dismiss → on ne re-prompt pas avant 14 jours.
 *
 * Se rouvre à la demande depuis Plan & Profil › Réglages (`InstallCard`) :
 * un tap à côté suffit à l'écarter, et rien d'autre ne permettait de la
 * revoir sans effacer les données du site.
 */

/** Demande d'ouverture, émise depuis n'importe quel écran. */
const OPEN_EVENT = 'macrotrack:install-prompt';

/**
 * Safari sur iPhone ou iPad. Chrome et Firefox iOS sont écartés : leur menu
 * Partager n'est pas au même endroit. Un iPad récent se déclare « Macintosh » ;
 * c'est l'écran tactile qui le distingue d'un Mac.
 */
function isIOS(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return ios && !/CriOS|FxiOS|EdgiOS/i.test(ua);
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari iOS specifique
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** L'invitation a-t-elle un sens ici : Safari iOS, app pas encore installée. */
export function canInstallFromSafari(): boolean {
  return isIOS() && !isStandalone();
}

/** Rouvre l'invitation, sans délai ni tenir compte d'un refus passé. */
export function openInstallPrompt(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function IOSInstallPrompt() {
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

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

/**
 * Carte des Réglages qui rouvre l'invitation. Absente partout où elle ne
 * servirait à rien : app déjà installée, Android, ordinateur, autre navigateur iOS.
 */
export function InstallCard() {
  if (!canInstallFromSafari()) return null;

  return (
    <button
      type="button"
      onClick={openInstallPrompt}
      className="block w-full text-left tap rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Card className="!p-4 flex items-center gap-3 active:opacity-80 transition-opacity">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Smartphone size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Installer l'app sur l'écran d'accueil</span>
          <span className="block text-[13px] text-text-muted leading-snug">
            En plein écran, sans la barre de Safari.
          </span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
      </Card>
    </button>
  );
}
