import { NavLink } from 'react-router-dom';
import { Home, UtensilsCrossed, LineChart, User, BookOpen } from 'lucide-react';
import { haptic } from '@/lib/haptic';

const tabs = [
  { to: '/',             label: 'Accueil',      icon: Home },
  { to: '/log',          label: 'Repas',        icon: UtensilsCrossed },
  { to: '/weight',       label: 'Poids',        icon: LineChart },
  { to: '/plan',         label: 'Plan',         icon: User },
  { to: '/explications', label: 'Explications', icon: BookOpen }
];

/**
 * Barre d'onglets, même dessin que GymTrack : posée dans le flux du shell (pas par-dessus
 * le contenu), filet fin, onglet actif en bleu avec l'icône légèrement grossie (repérage
 * périphérique sans lire le libellé).
 */
export function BottomTabBar() {
  return (
    <nav
      className="relative z-30 shrink-0 border-t border-border bg-white/95 backdrop-blur"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      role="tablist"
    >
      <ul className="flex">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.to === '/'}
              onClick={() => haptic('light')}
              className={({ isActive }) =>
                [
                  'pressable flex min-h-[52px] flex-col items-center justify-center gap-1 pb-1 pt-2 no-select',
                  isActive ? 'text-brand' : 'text-text-faint'
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`transition-transform duration-300 ease-ease ${isActive ? 'scale-110' : 'scale-100'}`}>
                    <t.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="text-[10px] font-semibold leading-none tracking-tight">{t.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
