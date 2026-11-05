import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, XCircle, Undo2 } from 'lucide-react';
import { useUIStore } from '@/store/uiStore';
import { haptic } from '@/lib/haptic';

export function ToastHost() {
  const toasts = useUIStore((s) => s.toasts);
  const dismiss = useUIStore((s) => s.dismissToast);
  return (
    <div className="fixed left-0 right-0 top-[max(env(safe-area-inset-top),8px)] z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto max-w-sm w-full rounded-2xl bg-surface-hi border border-border px-4 py-3 shadow-card flex items-center gap-3"
          >
            {/* Succès en BLEU (marque) et non en vert : un toast est une confirmation
                d'action, pas un état à interpréter — l'icône ✓ porte déjà le sens. */}
            {t.kind === 'success' && <CheckCircle2 size={18} className="text-brand shrink-0" />}
            {t.kind === 'error' && <XCircle size={18} className="text-danger shrink-0" />}
            {t.kind === 'info' && <Info size={18} className="text-brand shrink-0" />}
            <span className="text-sm text-text flex-1">{t.message}</span>
            {t.action && (
              <button
                onClick={() => {
                  haptic('medium');
                  t.action!.onPress();
                  dismiss(t.id);
                }}
                className="inline-flex items-center gap-1 text-brand font-semibold text-sm tap px-1 -mr-1"
              >
                <Undo2 size={14} /> {t.action.label}
              </button>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
