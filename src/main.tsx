import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// Force le thème clair : retire toute classe "dark" stale qui pourrait venir
// d'un ancien état de l'app (PWA en cache, settings legacy).
document.documentElement.classList.remove('dark', 'theme-light');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
