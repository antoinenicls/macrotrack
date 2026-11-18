import type { Config } from 'tailwindcss';

/**
 * Système visuel commun à GymTrack : fond blanc, cartes à filet fin sans ombre, rayons
 * de 20 px, boutons en pilule, Plus Jakarta Sans pour les titres et les chiffres, Inter
 * pour le texte. Couleurs via variables CSS (valeurs dans src/index.css).
 */
const cssVar = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        bg:           cssVar('c-bg'),
        surface:      { DEFAULT: cssVar('c-surface'), hi: cssVar('c-surface-hi') },
        'surface-hi': cssVar('c-surface-hi'),
        border:       cssVar('c-border'),
        /** Gris de fond des champs, segments et pastilles (= « alt » de GymTrack). */
        alt:          cssVar('c-surface-hi'),

        // Texte
        text: { DEFAULT: cssVar('c-text'), muted: cssVar('c-text-muted'), faint: cssVar('c-text-faint') },

        // Accents
        brand:   { DEFAULT: cssVar('c-brand'), hi: cssVar('c-brand-hi'), soft: cssVar('c-brand-soft') },
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
        '2xl': '18px',
        '3xl': '24px',
        card: '20px',
        pill: '980px'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        num: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif']
      },
      boxShadow: {
        card: 'none'
      },
      transitionTimingFunction: { ease: 'cubic-bezier(.16, 1, .3, 1)' },
      keyframes: {
        'page-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'item-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(.94)' },
          to: { opacity: '1', transform: 'scale(1)' }
        }
      },
      animation: {
        'page-in': 'page-in .28s cubic-bezier(.16, 1, .3, 1)',
        'item-in': 'item-in .34s cubic-bezier(.16, 1, .3, 1) both',
        'fade-in': 'fade-in .2s ease-out',
        'scale-in': 'scale-in .22s cubic-bezier(.16, 1, .3, 1)'
      }
    }
  },
  plugins: []
} satisfies Config;
