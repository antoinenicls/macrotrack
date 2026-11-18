import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';
import { ToastHost } from '@/components/ui';

interface Props {
  children: ReactNode;
}

/**
 * Hauteur de la bande opaque du haut : la zone de la barre d'état, plus 8 px (WebKit
 * cherche l'élément du bord 4 px à l'intérieur de l'écran, il lui faut une épaisseur
 * réelle, même quand l'encart vaut 0).
 */
const TOP_EDGE = 'calc(env(safe-area-inset-top) + 8px)';

/**
 * Shell d'application, calqué sur GymTrack.
 *
 * La page ne défile plus : seul <main> défile, entre une bande haute opaque et la barre
 * d'onglets posée dans le flux. Résultat : plus de rebond de toute la page (sensation
 * d'app native et non de site), et la barre d'onglets ne flotte plus par-dessus le
 * contenu.
 *
 * Bande haute opaque, contre le flou d'iOS 26 : une app installée reçoit un flou dégradé
 * sur le haut de la page (« Liquid Glass ») qui brouillait les titres. WebKit ne le
 * retire que s'il trouve, au bord haut, un élément fixe pleine largeur à fond OPAQUE.
 * Pas de `pointer-events: none` : WebKit la trouve par un test de toucher.
 */
export function AppShell({ children }: Props) {
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // Changement d'onglet : on repart du haut (la fenêtre ne défile plus, c'est <main>).
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div
      className="mx-auto flex w-full max-w-md flex-col bg-bg"
      style={{ height: 'var(--vh)', paddingTop: TOP_EDGE }}
    >
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 bg-bg" style={{ height: TOP_EDGE }} />
      <main ref={mainRef} className="scroll-area flex-1 min-h-0" style={{ overflowX: 'clip' }}>
        {children}
      </main>
      <BottomTabBar />
      <ToastHost />
    </div>
  );
}
