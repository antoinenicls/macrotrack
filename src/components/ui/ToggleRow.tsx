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
      className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl bg-alt tap text-left"
    >
      <div className="flex-1 pr-3">
        <div className="text-[15px] font-semibold leading-snug">{label}</div>
        {description && <div className="text-[13px] text-text-muted mt-0.5 leading-snug">{description}</div>}
      </div>
      {/* Interrupteur iOS, même dessin que GymTrack (vert quand actif). */}
      <span
        className={['relative h-[31px] w-[51px] shrink-0 rounded-pill transition-colors duration-200', checked ? 'bg-success' : 'bg-black/10'].join(' ')}
        aria-hidden
      >
        <span className={['absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-[2px]'].join(' ')} />
      </span>
    </button>
  );
}
