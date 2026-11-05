import { motion } from 'framer-motion';
import { clamp } from '@/lib/format';

interface Props {
  value: number;
  max: number;
  color?: string;
  height?: number;
  showOverflow?: boolean;
}

export function ProgressBar({ value, max, color = '#5b8cff', height = 10, showOverflow = true }: Props) {
  const ratio = max <= 0 ? 0 : value / max;
  const pct = clamp(ratio, 0, 1) * 100;
  const over = showOverflow && ratio > 1 ? clamp(ratio - 1, 0, 1) * 100 : 0;
  return (
    <div className="w-full rounded-full overflow-hidden" style={{ height, backgroundColor: 'rgb(var(--c-track) / var(--track-alpha))' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      />
      {over > 0 && (
        <div className="-mt-[var(--h)] h-full" style={{ ['--h' as any]: `${height}px` }}>
          <div className="h-full rounded-full bg-danger/70" style={{ width: `${over}%` }} />
        </div>
      )}
    </div>
  );
}
