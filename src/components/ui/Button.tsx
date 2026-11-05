import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { haptic, type HapticKind } from '@/lib/haptic';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  leadingIcon?: ReactNode;
  /** Type de retour haptique au clic. `false` pour désactiver. Défaut : auto selon la variante. */
  haptic?: HapticKind | false;
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white active:bg-brand/80',
  secondary: 'bg-surface-hi text-text active:bg-surface',
  ghost: 'bg-transparent text-text active:bg-surface-hi',
  danger: 'bg-danger/15 text-danger active:bg-danger/25'
};
const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-14 px-5 text-base'
};

// Mapping variante → type haptique par défaut
const DEFAULT_HAPTIC: Record<Variant, HapticKind> = {
  primary: 'medium',
  secondary: 'light',
  ghost: 'light',
  danger: 'warning'
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', block, leadingIcon, className = '', children, onClick, haptic: hapticProp, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold no-select transition-[transform,background] duration-100 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 tap',
        variants[variant],
        sizes[size],
        block ? 'w-full' : '',
        className
      ].join(' ')}
      onClick={(e) => {
        if (hapticProp !== false) haptic(hapticProp ?? DEFAULT_HAPTIC[variant]);
        onClick?.(e);
      }}
      {...rest}
    >
      {/* shrink-0 : dans une rangee serree (cf. l'en-tete de l'onglet Poids),
          l'icone se faisait ecraser a zero et le libelle debordait du bouton. */}
      {leadingIcon && <span className="shrink-0 inline-flex">{leadingIcon}</span>}
      {children}
    </button>
  );
});
