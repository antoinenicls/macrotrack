import { Input } from './Input';
import type { InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: number | '';
  onChange: (v: number | '') => void;
  label?: string;
  hint?: string;
  suffix?: string;
  step?: number;
  min?: number;
  max?: number;
}

export function NumberInput({ value, onChange, ...rest }: Props) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      pattern="[0-9]*"
      value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === '') onChange('');
        else {
          const n = parseFloat(v);
          onChange(Number.isFinite(n) ? n : '');
        }
      }}
      {...rest}
    />
  );
}
