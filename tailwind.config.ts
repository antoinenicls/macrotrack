import type { Config } from 'tailwindcss';

/**
 * Couleurs via variables CSS pour supporter dark/light/system.
 * Voir src/index.css pour les valeurs effectives par thème.
 */
const cssVar = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Pas de darkMode "class" ici : on gère via la variable CSS qui change selon
  // la classe sur <html>. Pas besoin du préfixe dark: dans les classes utilitaires.
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg:           cssVar('c-bg'),
        surface:      { DEFAULT: cssVar('c-surface'), hi: cssVar('c-surface-hi') },
        'surface-hi': cssVar('c-surface-hi'),
        border:       cssVar('c-border'),

        // Texte
        text: { DEFAULT: cssVar('c-text'), muted: cssVar('c-text-muted') },

        // Accents
        brand:   { DEFAULT: cssVar('c-brand'), hi: cssVar('c-brand-hi') },
        success: cssVar('c-success'),
        warn:    cssVar('c-warn'),
        danger:  cssVar('c-danger'),
        kcal:    cssVar('c-kcal'),
        protein: cssVar('c-protein'),
        carbs:   cssVar('c-carbs'),
        fat:     cssVar('c-fat'),

        // Couleurs accent par repas (cartes meal slot)
        'slot-pd': cssVar('c-slot-pd'),
        'slot-dj': cssVar('c-slot-dj'),
        'slot-dn': cssVar('c-slot-dn'),
        'slot-co': cssVar('c-slot-co')
      },
      borderRadius: {
        xl: '14px',
        '2xl': '20px',
        '3xl': '28px'
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'Roboto', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: 'var(--shadow-card)'
      }
    }
  },
  plugins: []
} satisfies Config;
