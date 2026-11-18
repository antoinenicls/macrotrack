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
    // Segments façon iOS / GymTrack : piste grise, segment actif blanc en relief, texte bleu.
    <div className="flex w-full gap-1 rounded-xl bg-alt p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => { if (!active) haptic('selection'); onChange(o.value); }}
            className={[
              'pressable min-h-[36px] flex-1 rounded-lg px-1 text-[13px] font-bold leading-tight transition-colors',
              active ? 'bg-white text-brand shadow-sm' : 'text-text-muted active:text-text'
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
