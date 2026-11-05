import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

/** Bleu de la marque, commun à GymTrack et MacroTrack. Sert de fond
 *  aux icônes opaques (jamais de blanc autour). */
const BRAND_BLUE = '#0A84FF';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    // Maskable : garde la zone de sécurité (padding) mais sur fond bleu, pas blanc.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BRAND_BLUE } },
    // iOS : PLEIN-CADRE (padding 0). La source est déjà un carré complet et iOS
    // applique lui-même son masque arrondi — un padding ajouterait un liseré blanc.
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background: BRAND_BLUE } }
  },
  // Source des icônes : le logo MacroTrack, aplati plein-cadre et opaque
  // (rendu depuis public/favicon.svg, qui reste la source de vérité).
  images: ['public/icon-source.png']
});
