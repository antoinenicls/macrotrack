import { useEffect, useState, type ReactNode } from 'react';
// HashRouter (et non BrowserRouter) : indispensable en PWA installée sur iOS.
// En standalone iOS (surtout sans manifest/scope, ex. serveur de dev), naviguer
// vers un autre CHEMIN (/foods, /plan…) fait croire à iOS qu'on quitte l'app →
// il ouvre le mini-navigateur Safari (l'URL/IP s'affiche). Le hash (#/foods) ne
// change jamais le chemin → la navigation reste dans l'app.
import { HashRouter } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { AppRoutes } from './routes';
import { ensureSeeded } from './services/seed';
import { useProfileStore } from './store/profileStore';
import { useFoodsStore } from './store/foodsStore';
import { useLogStore } from './store/logStore';
import { useWeightStore } from './store/weightStore';
import { IOSInstallPrompt } from './features/onboarding/IOSInstallPrompt';

function FullScreenMessage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center text-text-muted">
      <div className="animate-pulse">{children}</div>
    </div>
  );
}

/**
 * Racine : seed + chargement des stores (données locales), puis l'app. Aucun
 * compte : tout vit sur l'appareil.
 */
export function App() {
  const [ready, setReady] = useState(false);
  const loadProfile = useProfileStore((s) => s.load);
  const loadFoods = useFoodsStore((s) => s.load);
  const loadLog = useLogStore((s) => s.loadForDate);
  const loadWeight = useWeightStore((s) => s.load);
  const date = useLogStore((s) => s.date);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureSeeded();
        await Promise.all([loadProfile(), loadFoods(), loadWeight(), loadLog(date)]);
        // Aligne la cible du jour sur la reco vive du coach dès l'ouverture (maintenance
        // mesurée ou formule + anti-stagnation), au lieu d'attendre la prochaine pesée.
        // No-op si la cible n'a pas bougé (garde anti-bruit <25 kcal). Non bloquant.
        const ps = useProfileStore.getState();
        if (ps.settings?.adaptiveTargets) {
          await ps.recalcTargetsFromWeight().catch((e) => console.warn('[boot] recalc cible', e));
        }
        if (!cancelled) setReady(true);
      } catch (e) {
        console.error('[boot]', e);
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!ready) return <FullScreenMessage>Chargement…</FullScreenMessage>;

  return (
    <HashRouter>
      <AppShell>
        <AppRoutes />
      </AppShell>
      <IOSInstallPrompt />
    </HashRouter>
  );
}
