import type { ReactNode } from 'react';

interface Props {
  label: ReactNode;
  /** Explication sous le libellé (souvent différente selon l'état). */
  description?: ReactNode;
  checked: boolean;
  onToggle: () => void;
}

/**
 * Ligne « libellé + interrupteur » : toute la ligne est cliquable. Remplace les copies
 * du même interrupteur qui traînaient dans chaque panneau de l'onglet Plan.
 */
export function ToggleRow({ label, description, checked, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={checked}
      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-hi tap active:bg-surface text-left"
    >
      <div className="flex-1 pr-3">
        <div className="text-sm font-semibold">{label}</div>
        {description && <div className="text-xs text-text-muted mt-0.5 leading-snug">{description}</div>}
      </div>
      <span
        className={['shrink-0 w-11 h-6 rounded-full relative transition-colors', checked ? 'bg-brand' : 'bg-border'].join(' ')}
        aria-hidden
      >
        <span className={['absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all', checked ? 'left-[22px]' : 'left-0.5'].join(' ')} />
      </span>
    </button>
  );
}
