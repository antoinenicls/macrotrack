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
      {label && <span className="block text-sm text-text-muted mb-1.5">{label}</span>}
      <div className="relative">
        <input
          id={inputId}
          ref={ref}
          className={[
            'w-full h-12 px-3 rounded-xl bg-surface-hi border border-border text-text placeholder:text-text-muted/60',
            'focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30',
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
