import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

/**
 * Card avec bg + couleur HARDCODED pour bulletproof anti-cache et anti-dark.
 */
export function Card({ children, className = '', style, ...rest }: Props) {
  return (
    <div
      className={['rounded-3xl shadow-card p-5', className].join(' ')}
      style={{
        backgroundColor: '#FFFFFF',
        color: '#111827',
        border: '1px solid rgba(216, 227, 248, 0.8)',
        ...style
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
