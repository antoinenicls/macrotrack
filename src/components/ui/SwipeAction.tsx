import { motion, useMotionValue, useTransform } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { haptic } from '@/lib/haptic';

interface Props {
  children: ReactNode;
  onDelete: () => void;
}

/**
 * Swipe-to-delete style iOS. Glissement gauche → révèle bouton supprimer.
 * Au-delà d'un seuil + relâche → déclenche onDelete.
 */
export function SwipeAction({ children, onDelete }: Props) {
  const x = useMotionValue(0);
  const bgWidth = useTransform(x, (v) => Math.max(0, -v));
  // On déclenche un tap haptique au franchissement du seuil pour signaler "tu peux lâcher"
  const thresholdPrimed = useRef(false);

  return (
    <div className="relative overflow-hidden rounded-xl">
      <motion.div
        style={{ width: bgWidth }}
        className="absolute inset-y-0 right-0 bg-danger flex items-center justify-end pr-4"
      >
        <Trash2 size={20} className="text-white" />
      </motion.div>
      <motion.div
        drag="x"
        dragConstraints={{ left: -120, right: 0 }}
        dragElastic={0.05}
        style={{ x }}
        onDrag={(_, info) => {
          const past = info.offset.x < -90;
          if (past && !thresholdPrimed.current) {
            thresholdPrimed.current = true;
            haptic('selection');
          } else if (!past && thresholdPrimed.current) {
            thresholdPrimed.current = false;
          }
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -90) {
            haptic('warning');
            onDelete();
          }
          thresholdPrimed.current = false;
        }}
        className="relative bg-surface-hi"
      >
        {children}
      </motion.div>
    </div>
  );
}
