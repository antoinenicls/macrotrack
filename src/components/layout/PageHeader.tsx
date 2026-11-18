import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

/**
 * Titre de page, dans la typographie de GymTrack : gros titre Plus Jakarta très gras,
 * resserré, et la précision (date, contexte) en dessous, en gris. L'éventuelle action de
 * la page (`right`) est ancrée en haut à droite.
 */
export function PageHeader({ title, subtitle, right }: Props) {
  return (
    <header className="flex items-start justify-between gap-3 pb-2 pt-3">
      {/* min-w-0 : sans lui, un titre long pousse le groupe de droite hors de l'écran. */}
      <div className="min-w-0">
        <h1 className="font-display text-[32px] font-black leading-[1.04] tracking-[-1.5px] text-text">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[15px] text-text-muted first-letter:uppercase">{subtitle}</p>}
      </div>
      {/* whitespace-nowrap : l'action de page ne coupe jamais son libellé en deux. */}
      {right && <div className="flex shrink-0 items-center gap-2 whitespace-nowrap pt-1">{right}</div>}
    </header>
  );
}
