import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Force le thème clair : retire toute classe "dark" stale qui pourrait venir
// d'un ancien état de l'app (PWA en cache, settings legacy).
document.documentElement.classList.remove('dark', 'theme-light');

/**
 * Hauteur réelle du viewport. 100vh compte la barre d'URL rétractile de Safari mobile
 * et déborde : on mesure la vraie hauteur et on la publie en variable CSS (--vh), sur
 * laquelle le shell se cale (comme GymTrack).
 */
function syncViewportHeight(): void {
  document.documentElement.style.setProperty('--vh', `${window.innerHeight}px`);
}
syncViewportHeight();
window.addEventListener('resize', syncViewportHeight);
window.addEventListener('orientationchange', syncViewportHeight);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
