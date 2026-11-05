import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Pleine hauteur (modale plein écran) ou bottom-sheet ~88vh. */
  fullScreen?: boolean;
}

/**
 * Bottom-sheet style iOS, ou modale fullscreen.
 *
 * Layout en flex-column :
 *  - header (shrink-0) : titre + bouton close (croix)
 *  - content (flex-1 min-h-0) : scrollable, respecte la safe-area bottom
 *
 * `overscroll-behavior: contain` empêche le scroll de "chainer" au body sur iOS
 * (sinon, en butée, c'est l'arrière-plan qui défile).
 */
export function Sheet({ open, onClose, title, children, fullScreen = false }: Props) {
  // Hauteur du clavier virtuel + hauteur visible réelle, via la VisualViewport API.
  // Sur mobile (surtout iOS), l'ouverture du clavier ne réduit pas le layout viewport :
  // une sheet en `bottom: 0` se retrouve donc cachée derrière le clavier. On remonte
  // la sheet de la hauteur du clavier et on borne sa hauteur à la zone visible.
  const [kbInset, setKbInset] = useState(0);
  const [vvHeight, setVvHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) { setKbInset(0); setVvHeight(null); return; }
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbInset(inset);
      setVvHeight(vv.height);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKbInset(0);
      setVvHeight(null);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);

    // Bloque le scroll du body sous la sheet (et garde la position pour iOS)
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = { position: body.style.position, top: body.style.top, width: body.style.width };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      window.removeEventListener('keydown', onKey);
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="bg"
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            className={[
              'fixed inset-x-0 bottom-0 z-50 bg-surface border-t border-border flex flex-col',
              fullScreen ? 'top-0 rounded-none border-t-0' : 'rounded-t-3xl max-h-[88vh]'
            ].join(' ')}
            style={{
              // Remonte la sheet au-dessus du clavier
              bottom: kbInset,
              // Borne la hauteur à la zone visible (clavier ouvert) pour rester scrollable
              maxHeight: vvHeight != null
                ? `${vvHeight * (fullScreen ? 1 : 0.92)}px`
                : undefined
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          >
            {/* Header — fixe en haut */}
            <div className={['relative px-4 shrink-0', fullScreen ? 'pt-safe' : ''].join(' ')}>
              <div className="pt-4">
                <div className="flex items-center">
                  {title && <h3 className="font-semibold text-base">{title}</h3>}
                  <button
                    aria-label="Fermer"
                    onClick={onClose}
                    className="ml-auto tap text-text-muted active:text-text"
                  >
                    <X size={22} />
                  </button>
                </div>
              </div>
            </div>

            {/* Contenu scrollable — prend la hauteur restante */}
            <div
              className="flex-1 min-h-0 overflow-y-auto px-4 pt-2"
              style={{
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)'
              }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
