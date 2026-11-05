import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { LoggingPage } from './features/nutrition/LoggingPage';
import { ExplanationsPage } from './features/explanations/ExplanationsPage';
import { WeightPage } from './features/weight/WeightPage';
import { PlanPage } from './features/plan/PlanPage';

/** Ordre des onglets, identique à la barre du bas. */
const TAB_ORDER = ['/', '/log', '/weight', '/plan', '/explications'] as const;

/** Index d'un chemin dans l'ordre des onglets (−1 si hors onglets). */
const tabIndex = (path: string) => (TAB_ORDER as readonly string[]).indexOf(path);

/**
 * Routes + petite animation de glissement entre onglets. La page entrante glisse
 * depuis la DROITE quand on va vers un onglet suivant, depuis la GAUCHE pour un
 * précédent (même ordre que la barre du bas), avec un léger fondu. On n'anime que la page
 * entrante (l'ancienne se démonte instantanément) : pas de superposition, donc pas
 * de double scroll ni de saut de hauteur.
 */
export function AppRoutes() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // Chemin précédent (mis à jour APRÈS le rendu) pour connaître le sens du mouvement.
  const prevPath = useRef(location.pathname);
  const from = tabIndex(prevPath.current);
  const to = tabIndex(location.pathname);
  const dir = from !== -1 && to !== -1 && from !== to ? Math.sign(to - from) : 0;
  useEffect(() => { prevPath.current = location.pathname; });

  const offset = reduce ? 0 : 28;

  return (
    <motion.div
      ref={ref}
      key={location.pathname}
      initial={{ opacity: 0, x: dir * offset }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
      // À la fin, on retire le transform résiduel : sinon il crée un bloc de
      // confinement qui reparente les sheets (position: fixed) → cassure de layout.
      onAnimationComplete={() => { if (ref.current) ref.current.style.transform = 'none'; }}
    >
      <Routes location={location}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/log" element={<LoggingPage />} />
        <Route path="/weight" element={<WeightPage />} />
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/explications" element={<ExplanationsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </motion.div>
  );
}
