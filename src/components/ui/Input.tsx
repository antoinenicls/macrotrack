import { forwardRef, type InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, suffix, className = '', id, ...rest },
  ref
) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className="block">
      {label && <span className="block text-[13px] font-semibold text-text-muted mb-1.5">{label}</span>}
      <div className="relative">
        <input
          id={inputId}
          ref={ref}
          className={[
            // Champ façon GymTrack : fond gris sans bordure, bleuté au focus.
            'w-full h-12 px-3.5 rounded-xl bg-alt border border-transparent text-text placeholder:text-text-faint',
            'transition-colors focus:outline-none focus:bg-brand-soft focus:border-brand/40',
            suffix ? 'pr-12' : '',
            error ? 'border-danger' : '',
            className
          ].join(' ')}
          {...rest}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">{suffix}</span>
        )}
      </div>
      {error ? <span className="block text-xs text-danger mt-1">{error}</span>
       : hint ? <span className="block text-xs text-text-muted mt-1">{hint}</span> : null}
    </label>
  );
});
