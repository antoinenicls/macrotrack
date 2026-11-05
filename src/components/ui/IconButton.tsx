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
        'inline-flex items-center justify-center rounded-full tap text-text active:bg-surface-hi transition-colors',
        className
      ].join(' ')}
      onClick={(e) => { haptic('light'); onClick?.(e); }}
      {...rest}
    >
      {children}
    </button>
  );
});
