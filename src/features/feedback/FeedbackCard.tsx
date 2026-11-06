import { ChevronRight, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui';

/** Formulaire d'avis (Tally), commun aux apps et au site. Le champ caché `app` dit d'où vient le message. */
export const FEEDBACK_URL = 'https://tally.so/r/5X4kDb?app=MacroTrack';

/**
 * Lien vers le formulaire d'avis : une idée, un bug, sans passer par GitHub.
 * Ouvert dans un nouvel onglet pour ne pas quitter l'app (PWA installée comprise).
 */
export function FeedbackCard() {
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener"
      className="block tap rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      <Card className="!p-4 flex items-center gap-3 active:opacity-80 transition-opacity">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand/10 text-brand">
          <MessageCircle size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">Donner mon avis</span>
          <span className="block text-[13px] text-text-muted leading-snug">
            Une idée, un bug, une remarque : je lis tout.
          </span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted" />
      </Card>
    </a>
  );
}
