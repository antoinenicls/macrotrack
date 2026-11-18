import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Card } from './Card';
import { haptic } from '@/lib/haptic';

interface Props {
  title: string;
  /** Icône à gauche du titre, pour repérer la carte d'un coup d'œil. */
  icon?: ReactNode;
  /** Résumé de l'état actuel sous le titre, visible même replié (ex. « Sèche · 2 150 kcal/j »). */
  summary?: ReactNode;
  /** Ouvert au départ ? Défaut : fermé (replié). */
  defaultOpen?: boolean;
  /** Contenu optionnel à droite du titre, visible même replié (ex. badge). */
  headerRight?: ReactNode;
  children: ReactNode;
}

/**
 * Encadré repliable : l'en-tête (icône, titre, résumé) sert de bouton d'ouverture/fermeture,
 * avec une flèche à droite qui pivote selon l'état. Replié par défaut. Le résumé dit ce qui
 * est réglé sans avoir à ouvrir : on trouve la bonne carte sans tout déplier.
 */
export function CollapsibleCard({ title, icon, summary, defaultOpen = false, headerRight, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="!p-0 overflow-hidden">
      <button
        onClick={() => { haptic('light'); setOpen((o) => !o); }}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left tap"
        aria-expanded={open}
      >
        {icon && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">{icon}</span>}
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-[15px] leading-snug">{title}</span>
          {summary && <span className="block text-[13px] text-text-muted mt-0.5 leading-snug break-words">{summary}</span>}
        </span>
        {headerRight}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
          <ChevronDown size={20} className="text-text-muted" />
        </motion.span>
      </button>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </Card>
  );
}
