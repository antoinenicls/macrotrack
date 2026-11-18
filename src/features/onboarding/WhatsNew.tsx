import { useEffect, useRef, useState } from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Sheet, Button, Card } from '@/components/ui';
import { useProfileStore } from '@/store/profileStore';
import { CHANGELOG } from '@/data/changelog';
import { entryDate, latestId, sortedEntries, unseenEntries, WHATS_NEW_MAX, type ChangelogEntry } from '@/lib/whatsNew';
import { formatShortDate } from '@/lib/dates';
import { installPromptDue } from './IOSInstallPrompt';

/**
 * « Quoi de neuf » : à l'ouverture, une seule fois, les nouveautés sorties depuis la
 * dernière visite (au plus WHATS_NEW_MAX, le reste derrière « Voir les N autres »).
 * Jamais en même temps que l'invitation à installer l'app : elle passe en premier, les
 * nouveautés attendent l'ouverture suivante. Une installation neuve ne voit rien (le seed
 * marque tout comme vu). Se rouvre depuis Plan › Réglages (`WhatsNewCard`).
 */

const OPEN_EVENT = 'macrotrack:whats-new';

export function openWhatsNew(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function WhatsNew() {
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  /** `unseen` : ouverture automatique ; `all` : rouverte depuis les Réglages. */
  const [mode, setMode] = useState<'unseen' | 'all' | null>(null);
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    const show = () => { setEntries(sortedEntries(CHANGELOG)); setExpanded(true); setMode('all'); };
    window.addEventListener(OPEN_EVENT, show);
    return () => window.removeEventListener(OPEN_EVENT, show);
  }, []);

  // Décidé une seule fois, au premier chargement des réglages. Le délai vit dans son propre
  // effet : un réglage enregistré entre-temps (recalcul de cible au démarrage…) ne doit pas
  // l'annuler.
  const [pending, setPending] = useState<ChangelogEntry[] | null>(null);
  useEffect(() => {
    if (!settings || checked.current) return;
    checked.current = true;
    const unseen = unseenEntries(CHANGELOG, settings.whatsNewSeenId);
    if (unseen.length > 0 && !installPromptDue(settings)) setPending(unseen);
  }, [settings]);
  useEffect(() => {
    if (!pending) return;
    // Petit délai : laisse l'accueil s'afficher avant.
    const t = setTimeout(() => { setEntries(pending); setExpanded(false); setMode('unseen'); }, 1200);
    return () => clearTimeout(t);
  }, [pending]);

  const close = async () => {
    setMode(null);
    const latest = latestId(CHANGELOG);
    const cur = useProfileStore.getState().settings;
    if (cur && latest && (!cur.whatsNewSeenId || cur.whatsNewSeenId < latest)) {
      await saveSettings({ ...cur, whatsNewSeenId: latest });
    }
  };

  const visible = expanded ? entries : entries.slice(0, WHATS_NEW_MAX);
  const hidden = entries.length - visible.length;

  return (
    <Sheet open={mode !== null} onClose={close} title={mode === 'all' ? 'Nouveautés' : 'Quoi de neuf'}>
      <div className="space-y-4 pb-2">
        <ul className="divide-y divide-border">
          {visible.map((e) => (
            <li key={e.id} className="py-3 first:pt-0">
              <div className="flex items-baseline justify-between gap-3">
                <h4 className="text-[15px] font-semibold leading-snug">{e.title}</h4>
                <span className="shrink-0 text-xs text-text-muted">{formatShortDate(entryDate(e))}</span>
              </div>
              <p className="mt-1 text-sm text-text-muted leading-snug">{e.body}</p>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} className="text-sm font-semibold text-brand tap">
            Voir {hidden === 1 ? "l'autre" : `les ${hidden} autres`}
          </button>
        )}
        <Button block onClick={close}>OK</Button>
      </div>
    </Sheet>
  );
}

/** Carte des Réglages : toutes les nouveautés, à tout moment. */
export function WhatsNewCard() {
  const latest = sortedEntries(CHANGELOG)[0];
  if (!latest) return null;
  return (
    <button
      type="button"
      onClick={openWhatsNew}
      className="block w-full text-left tap rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Card className="!p-4 flex items-center gap-3 active:opacity-80 transition-opacity">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <Sparkles size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Nouveautés</span>
          <span className="block text-[13px] text-text-muted leading-snug">Dernière : {latest.title}</span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
      </Card>
    </button>
  );
}
