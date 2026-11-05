import { haptic } from '@/lib/haptic';

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <div className="inline-flex bg-surface-hi rounded-xl p-1 gap-1 w-full">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => { if (!active) haptic('selection'); onChange(o.value); }}
            className={[
              'flex-1 h-9 rounded-lg text-sm font-medium transition-colors',
              active ? 'bg-brand text-white' : 'text-text-muted active:text-text'
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
