import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}

/**
 * Header de page. Couleurs HARDCODED pour éviter tout overload dark mode iOS.
 * L'éventuelle action de la page (`right`) est ancrée en haut à droite.
 */
export function PageHeader({ title, subtitle, right }: Props) {
  return (
    <header className="pt-safe">
      <div className="flex items-end justify-between gap-3 px-5 pt-5 pb-3">
        {/* min-w-0 : sans lui, un titre long pousse le groupe de droite hors
            de l'ecran au lieu de se laisser tronquer. */}
        <div className="min-w-0">
          {subtitle && (
            <p
              className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1"
              style={{ color: '#0060DF' }}
            >
              {subtitle}
            </p>
          )}
          <h1
            className="text-[30px] font-extrabold leading-[1.05] tracking-tight"
            style={{ color: '#111827' }}
          >
            {title}
          </h1>
        </div>
        {/* whitespace-nowrap : l'action de page ne doit jamais couper son
            libelle en deux ("Ajou-ter") quand la place se resserre. */}
        {right && (
          <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
            {right}
          </div>
        )}
      </div>
    </header>
  );
}
