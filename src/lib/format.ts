export function round(n: number, digits = 0): number {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
}

export function fmtKcal(n: number): string {
  return `${Math.round(n)} kcal`;
}

export function fmtG(n: number): string {
  // Espace INSÉCABLE entre la valeur et l'unité : empêche « 72,5 » et « g » de se
  // retrouver sur deux lignes quand la place manque.
  return `${round(n, 1)} g`;
}

export function fmtKg(n: number): string {
  return `${round(n, 2)} kg`;
}

export function fmtDelta(n: number, unit = 'kg'): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${round(n, 2)} ${unit}`;
}

export function fmtPct(n: number): string {
  return `${round(n, 1)} %`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Formate un nombre de portions parlant.
 *  - 1.0 → "1 œuf moyen"
 *  - 3.0 → "3 œufs moyens" (pluriel approximatif : remplace label "1 X" par "N X")
 *  - 0.5 → "½ œuf moyen"
 *  - 2.5 → "2½ œufs moyens"
 * Si le compte est trop loin d'un nombre simple, retourne null.
 */
import type { Food, FoodServing } from '@/types';

/**
 * Pour une quantité affichée en CUIT d'un aliment dont les macros sont en cru/sec
 * (cookedFactor défini), renvoie l'équivalent natif : ex "≈ 90 g sec", "≈ 180 g cru".
 * Renvoie null si non pertinent : aliment nativement cuit (conserve, légume),
 * pas de facteur de conversion, ou quantité déjà saisie en cru/sec.
 */
export function rawEquivLabel(food: Food, grams: number, cooked: boolean): string | null {
  if (!cooked || food.state !== 'raw') return null;
  if (!food.cookedFactor || food.cookedFactor === 1) return null;
  const raw = Math.round(grams / food.cookedFactor);
  const word = food.id.includes('-sec') || food.name.toLowerCase().includes('(sec') ? 'sec' : 'cru';
  return `≈ ${raw} g ${word}`;
}

export function describeServing(grams: number, serving: FoodServing): string | null {
  if (serving.grams <= 0 || grams <= 0) return null;
  const raw = grams / serving.grams;
  // Arrondi au 0.5 le plus proche
  const half = Math.round(raw * 2) / 2;
  if (half <= 0) return null;
  // Tolérance ±10% pour éviter d'afficher "3 œufs" pour 175g
  if (Math.abs(raw - half) / half > 0.12) return null;

  const intPart = Math.floor(half);
  const frac = half - intPart;
  const numStr = frac === 0 ? `${intPart}` : intPart === 0 ? '½' : `${intPart}½`;

  // Pluriel basique : remplace "1 " initial du label par le compte
  const base = serving.label.replace(/^1\s*/, '');
  // Pluriel du mot (heuristique simple : ajoute "s" si compte > 1 et pas déjà pluriel/invariable)
  let labelOut = base;
  if (half > 1) {
    labelOut = pluralize(base);
  }
  return `${numStr} ${labelOut}`;
}

function pluralize(s: string): string {
  // Mots qui ne prennent pas de "s" supplémentaire
  const irregular: Record<string, string> = {
    'œuf moyen': 'œufs moyens',
    'gros œuf': 'gros œufs',
    'banane moyenne': 'bananes moyennes',
    'grosse banane': 'grosses bananes',
    'pomme moyenne': 'pommes moyennes',
    'kiwi': 'kiwis',
    'datte': 'dattes',
    'cerneau': 'cerneaux',
    'poignée (~5)': 'poignées',
    'poignée (~10)': 'poignées',
    'poignée': 'poignées',
    'grosse poignée': 'grosses poignées',
    'carré': 'carrés',
    'c.à.s': 'c.à.s',
    'c.à.c': 'c.à.c',
    'pavé': 'pavés',
    'steak': 'steaks',
    'gros steak': 'gros steaks',
    'blanc moyen': 'blancs moyens',
    'petit blanc': 'petits blancs',
    'moyenne': 'moyennes',
    'grosse': 'grosses',
    'portion': 'portions',
    'grosse portion': 'grosses portions',
    'portion sèche': 'portions sèches',
    'portion (~6)': 'portions',
    'pot': 'pots',
    'gros bol': 'gros bols',
    'bol': 'bols',
    'dose (scoop)': 'doses',
    'boîte égouttée': 'boîtes égouttées',
    'petite boîte': 'petites boîtes'
  };
  return irregular[s] ?? s + 's';
}
