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
 * Bottom tab bar — bg + couleurs HARDCODED en blanc pour éviter le rendu dark de Safari iOS.
 */
export function BottomTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30"
      style={{
        backgroundColor: '#FFFFFF',
        borderTop: '1px solid rgb(216, 227, 248)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}
      role="tablist"
    >
      <ul className="grid grid-cols-5 h-[52px]">
        {tabs.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.to === '/'}
              onClick={() => haptic('light')}
              className="h-full flex flex-col items-center justify-center gap-1 tap no-select transition-colors"
              style={({ isActive }) => ({
                color: isActive ? '#0060DF' : '#6B7280'
              })}
            >
              <t.icon size={22} strokeWidth={2} />
              <span className="text-[10px] font-medium leading-none">{t.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
