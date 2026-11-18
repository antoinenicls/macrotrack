import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { haptic } from '@/lib/haptic';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, children, className = '', onClick, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      className={[
        'inline-flex items-center justify-center rounded-xl tap text-text-muted active:bg-alt',
        className
      ].join(' ')}
      onClick={(e) => { haptic('light'); onClick?.(e); }}
      {...rest}
    >
      {children}
    </button>
  );
});
