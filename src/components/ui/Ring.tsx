import { motion } from 'framer-motion';
import { clamp } from '@/lib/format';

interface Props {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color: string;
  label?: string;
  sublabel?: string;
}

/**
 * Anneau de progression animé (Framer Motion + SVG stroke-dashoffset).
 * Value et max sont en unités absolues ; le ratio est clampé entre 0 et 1.
 * En cas de dépassement, on superpose un anneau rouge représentant le surplus.
 */
export function Ring({ value, max, size = 68, stroke = 7, color, label, sublabel }: Props) {
  const ratio = max <= 0 ? 0 : clamp(value / max, 0, 1.25);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - Math.min(ratio, 1));
  const overflow = Math.max(0, ratio - 1);

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(var(--c-track) / var(--track-alpha))" strokeWidth={stroke} fill="none" />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
          {overflow > 0 && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke="#ef4444"
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - Math.min(overflow, 1))}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${size >= 80 ? 'text-base' : 'text-sm'} font-bold leading-none`}>{Math.round(value)}</span>
          {sublabel && <span className={`${size >= 80 ? 'text-[10px]' : 'text-[9px]'} text-text-muted mt-0.5`}>{sublabel}</span>}
        </div>
      </div>
      {label && <span className="text-[11px] uppercase tracking-wide text-text-muted">{label}</span>}
    </div>
  );
}
