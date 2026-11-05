import type { ReactNode } from 'react';
import { BottomTabBar } from './BottomTabBar';
import { ToastHost } from '@/components/ui';

interface Props {
  children: ReactNode;
}

/**
 * Conteneur principal mobile-first.
 * Réserve l'espace pour la bottom tab bar (≈ 56px + safe-area bottom).
 */
export function AppShell({ children }: Props) {
  return (
    <div className="min-h-full w-full max-w-md mx-auto bg-bg" style={{ overflowX: 'clip' }}>
      <main className="pb-[calc(56px+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomTabBar />
      <ToastHost />
    </div>
  );
}
