import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { haptic, type HapticKind } from '@/lib/haptic';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'tinted';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  leadingIcon?: ReactNode;
  /** Type de retour haptique au clic. `false` pour désactiver. Défaut : auto selon la variante. */
  haptic?: HapticKind | false;
}

/** Mêmes boutons que GymTrack : pilule, Plus Jakarta gras, enfoncement au toucher. */
const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white active:brightness-95',
  secondary: 'border-[1.5px] border-black/15 bg-white text-text active:bg-alt',
  ghost: 'bg-transparent text-text-muted active:bg-alt',
  danger: 'bg-red-50 text-red-600 active:bg-red-100',
  tinted: 'bg-brand-soft text-brand active:bg-brand/15'
};
const sizes: Record<Size, string> = {
  sm: 'min-h-[36px] px-3.5 text-[13px]',
  md: 'min-h-[44px] px-5 text-[15px]',
  lg: 'min-h-[52px] px-6 text-[16px]'
};

// Mapping variante → type haptique par défaut
const DEFAULT_HAPTIC: Record<Variant, HapticKind> = {
  primary: 'medium',
  secondary: 'light',
  ghost: 'light',
  danger: 'warning',
  tinted: 'light'
};

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', block, leadingIcon, className = '', children, onClick, haptic: hapticProp, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-pill font-display font-bold no-select',
        'disabled:opacity-40 disabled:active:scale-100',
        block ? 'pressable pressable-wide w-full' : 'pressable',
        variants[variant],
        sizes[size],
        className
      ].join(' ')}
      onClick={(e) => {
        if (hapticProp !== false) haptic(hapticProp ?? DEFAULT_HAPTIC[variant]);
        onClick?.(e);
      }}
      {...rest}
    >
      {/* shrink-0 : dans une rangée serrée, l'icône ne se fait pas écraser à zéro. */}
      {leadingIcon && <span className="shrink-0 inline-flex">{leadingIcon}</span>}
      {children}
    </button>
  );
});
