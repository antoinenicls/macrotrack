import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Quand true, ne pas afficher l'icône (pour les hints très courts). */
  noIcon?: boolean;
}

/**
 * Texte d'aide court, italique, avec icône info. À placer sous un champ
 * ou un titre de section pour expliquer en 1 ligne ce que ça fait.
 */
export function HelpHint({ children, noIcon }: Props) {
  return (
    <p className="text-xs text-text-muted mt-1.5 flex items-start gap-1.5 leading-snug">
      {!noIcon && <Info size={12} className="mt-0.5 shrink-0 opacity-70" />}
      <span>{children}</span>
    </p>
  );
}
