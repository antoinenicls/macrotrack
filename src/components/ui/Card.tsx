import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Carte, même dessin que GymTrack : blanche, filet fin, rayon 20 px, sans ombre.
 * Le fond et la couleur restent en dur (rendu clair garanti même si iOS force le sombre).
 */
export function Card({ children, className = '', style, ...rest }: Props) {
  return (
    <div
      className={['rounded-card border border-border p-4', className].join(' ')}
      style={{ backgroundColor: '#FFFFFF', color: '#1D1D1F', ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}
