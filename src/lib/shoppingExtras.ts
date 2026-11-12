import type { Aisle } from './aisles';

/* =========================================================================
 *  Articles « en plus » de la liste de courses : tout ce que le plan ne génère
 *  pas (capsules de café, déodorant, lessive, un pack de yaourts pour la maison…),
 *  ajouté à la main pour n'avoir QU'UNE liste de courses.
 *
 *  Logique pure (aucun accès store / DB) pour rester testable.
 *
 *  Cycle de vie d'un article :
 *    - ajouté → reste dans la liste, semaine après semaine, tant qu'il n'est pas pris ;
 *    - coché → passe « dans le panier », marqué avec la semaine de courses ;
 *    - la semaine de courses suivante, les articles pris sont retirés d'eux-mêmes
 *      (même rythme que les aliments du plan, dont les coches repartent à zéro).
 *  Chaque article ajouté alimente les « récents » : un tap suffit pour le remettre
 *  la fois suivante, dans le rayon qu'on lui avait choisi.
 * ========================================================================= */

export interface ShoppingExtra {
  id: string;
  /** Libellé libre, tel que saisi (« Capsules café x2 »). */
  name: string;
  aisle: Aisle;
  /** Clé de la semaine de courses (lundi, `yyyy-MM-dd`) où l'article a été pris. Absent = à prendre. */
  checkedWeek?: string;
  addedAt: number;
}

/** Article déjà acheté une fois : proposé en ajout rapide, avec son rayon. */
export interface ShoppingRecent {
  name: string;
  aisle: Aisle;
}

export interface ShoppingState {
  extras: ShoppingExtra[];
  recents: ShoppingRecent[];
}

/** Nombre de récents mémorisés (les plus anciens sortent d'eux-mêmes). */
export const MAX_RECENTS = 16;

/** Minuscules, sans accents ni ponctuation : « Capsules de Café ! » → « capsules de cafe ». */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Mots-clés par rayon, testés DANS CET ORDRE : le non-alimentaire d'abord, pour que
 * « crème hydratante » parte en hygiène et « lait corporel » ne finisse pas en crémerie.
 * Un mot-clé reconnaît le mot exact ou son pluriel (s / x / es).
 */
const KEYWORDS: Array<[Aisle, string[]]> = [
  ['hygiene', [
    'deodorant', 'deo', 'dentifrice', 'dents', 'dentaire', 'shampoing', 'shampooing', 'apres shampoing',
    'douche', 'savon', 'rasoir', 'raser', 'lame', 'coton', 'cotons', 'tige', 'mouchoir', 'toilette',
    'pq', 'hydratante', 'solaire', 'corporel', 'corps', 'visage', 'maquillage', 'demaquillant',
    'serviette hygienique', 'tampon', 'protege slip', 'parfum', 'hygiene', 'pansement', 'doliprane',
    'micellaire', 'paracetamol', 'ibuprofene', 'medicament', 'couche', 'lingette', 'baume', 'creme mains'
  ]],
  ['entretien', [
    'nettoyant', 'lessive', 'adoucissant', 'vaisselle', 'lave vaisselle', 'eponge', 'poubelle', 'javel',
    'essuie tout', 'sopalin', 'desinfectant', 'detergent', 'detartrant', 'vinaigre blanc', 'serpilliere',
    'balai', 'alu', 'aluminium', 'film', 'papier cuisson', 'ampoule', 'pile', 'allumette',
    'bougie', 'menage', 'wc', 'vitre', 'sol', 'gant', 'entretien', 'sac'
  ]],
  ['boissons', [
    'cafe', 'capsule', 'dosette', 'expresso', 'espresso', 'the', 'tisane', 'infusion', 'eau', 'jus',
    'soda', 'coca', 'limonade', 'sirop', 'biere', 'vin', 'boisson', 'chicoree', 'cacao'
  ]],
  ['complements', ['whey', 'proteine', 'creatine', 'vitamine', 'omega', 'magnesium', 'collagene', 'complement']],
  ['boulangerie', ['pain', 'baguette', 'brioche', 'croissant', 'viennoiserie', 'pain de mie', 'wrap', 'tortilla']],
  ['cremerie', [
    'lait', 'yaourt', 'yogourt', 'skyr', 'fromage', 'beurre', 'creme', 'oeuf', 'emmental', 'comte',
    'mozzarella', 'parmesan', 'feta', 'chevre', 'ricotta', 'kefir'
  ]],
  ['boucherie', [
    'viande', 'poulet', 'boeuf', 'steak', 'jambon', 'dinde', 'porc', 'veau', 'agneau', 'saucisse',
    'lardon', 'poisson', 'saumon', 'cabillaud', 'crevette', 'charcuterie'
  ]],
  ['conserves', ['conserve', 'boite', 'thon', 'sardine', 'maquereau', 'mais', 'pois chiche', 'haricot rouge']],
  ['produce', [
    'fruit', 'legume', 'salade', 'pomme', 'poire', 'banane', 'orange', 'citron', 'kiwi', 'fraise',
    'raisin', 'avocat', 'tomate', 'oignon', 'ail', 'echalote', 'carotte', 'courgette', 'poivron',
    'concombre', 'brocoli', 'epinard', 'champignon', 'herbe', 'persil', 'basilic', 'pomme de terre'
  ]],
  ['epicerie-salee', [
    'riz', 'pate', 'pates', 'farine', 'sel', 'poivre', 'huile', 'vinaigre', 'epice', 'moutarde',
    'ketchup', 'mayonnaise', 'sauce', 'bouillon', 'semoule', 'quinoa', 'lentille', 'avoine', 'flocon'
  ]],
  ['gouter', [
    'chocolat', 'biscuit', 'gateau', 'confiture', 'miel', 'cereale', 'sucre', 'bonbon', 'compote',
    'amande', 'noix', 'noisette', 'cacahuete', 'dattes', 'barre'
  ]]
];

function matches(tokens: string[], padded: string, keyword: string): boolean {
  if (keyword.includes(' ')) return padded.includes(` ${keyword} `) || padded.includes(` ${keyword}s `);
  return tokens.some((t) => t === keyword || t === `${keyword}s` || t === `${keyword}x` || t === `${keyword}es`);
}

/**
 * Rayon probable d'un article saisi à la main. Un article déjà acheté reprend le rayon
 * qu'on lui avait donné (choix de l'utilisateur > devinette) ; sinon mots-clés ; sinon Divers.
 */
export function guessAisle(name: string, recents: ShoppingRecent[] = []): Aisle {
  const norm = normalizeName(name);
  if (!norm) return 'divers';
  const known = recents.find((r) => normalizeName(r.name) === norm);
  if (known) return known.aisle;
  const tokens = norm.split(' ');
  const padded = ` ${norm} `;
  for (const [aisle, words] of KEYWORDS) {
    if (words.some((w) => matches(tokens, padded, w))) return aisle;
  }
  return 'divers';
}

/** Libellé propre : espaces superflus retirés, première lettre en majuscule. */
export function cleanName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** Met un article en tête des récents (dédoublonné, rayon mis à jour, liste bornée). */
function pushRecent(recents: ShoppingRecent[], entry: ShoppingRecent): ShoppingRecent[] {
  const norm = normalizeName(entry.name);
  return [entry, ...recents.filter((r) => normalizeName(r.name) !== norm)].slice(0, MAX_RECENTS);
}

export type AddResult =
  | { status: 'added'; state: ShoppingState; extra: ShoppingExtra }
  | { status: 'duplicate'; state: ShoppingState; extra: ShoppingExtra }
  | { status: 'empty'; state: ShoppingState };

/**
 * Ajoute un article. Un article déjà présent n'est pas doublé : s'il était dans le panier,
 * il revient « à prendre » (on en a besoin à nouveau).
 */
export function addExtra(state: ShoppingState, rawName: string, id: string, now: number, aisle?: Aisle): AddResult {
  const name = cleanName(rawName);
  if (!name) return { status: 'empty', state };
  const norm = normalizeName(name);
  const existing = state.extras.find((e) => normalizeName(e.name) === norm);
  if (existing) {
    const extras = existing.checkedWeek
      ? state.extras.map((e) => (e.id === existing.id ? { ...e, checkedWeek: undefined } : e))
      : state.extras;
    return { status: 'duplicate', state: { ...state, extras }, extra: { ...existing, checkedWeek: undefined } };
  }
  const extra: ShoppingExtra = { id, name, aisle: aisle ?? guessAisle(name, state.recents), addedAt: now };
  return {
    status: 'added',
    extra,
    state: { extras: [...state.extras, extra], recents: pushRecent(state.recents, { name, aisle: extra.aisle }) }
  };
}

/** Coche (avec la semaine de courses) ou décoche un article. */
export function setExtraChecked(extras: ShoppingExtra[], id: string, weekKey: string | undefined): ShoppingExtra[] {
  return extras.map((e) => (e.id === id ? { ...e, checkedWeek: weekKey } : e));
}

/** Décoche tous les articles (« Tout décocher »). */
export function uncheckAllExtras(extras: ShoppingExtra[]): ShoppingExtra[] {
  return extras.some((e) => e.checkedWeek) ? extras.map((e) => ({ ...e, checkedWeek: undefined })) : extras;
}

/** Retire un article de la liste (les récents le gardent pour un ré-ajout rapide). */
export function removeExtra(extras: ShoppingExtra[], id: string): ShoppingExtra[] {
  return extras.filter((e) => e.id !== id);
}

/**
 * Modifie un article (libellé et/ou rayon). Le rayon choisi est retenu dans les récents :
 * la prochaine fois, l'article reviendra directement au bon endroit.
 */
export function editExtra(state: ShoppingState, id: string, patch: { name?: string; aisle?: Aisle }): ShoppingState {
  const current = state.extras.find((e) => e.id === id);
  if (!current) return state;
  const name = patch.name !== undefined ? cleanName(patch.name) || current.name : current.name;
  const aisle = patch.aisle ?? current.aisle;
  if (name === current.name && aisle === current.aisle) return state;
  const renamed = name !== current.name;
  const recents = renamed
    ? pushRecent(state.recents.filter((r) => normalizeName(r.name) !== normalizeName(current.name)), { name, aisle })
    : pushRecent(state.recents, { name, aisle });
  return {
    extras: state.extras.map((e) => (e.id === id ? { ...e, name, aisle } : e)),
    recents
  };
}

/**
 * Nettoyage de début de semaine de courses : les articles pris lors d'une semaine
 * PRÉCÉDENTE sont retirés. Renvoie le même tableau si rien ne change (pas d'écriture inutile).
 */
export function purgeBought(extras: ShoppingExtra[], weekKey: string): ShoppingExtra[] {
  const kept = extras.filter((e) => !e.checkedWeek || e.checkedWeek >= weekKey);
  return kept.length === extras.length ? extras : kept;
}

/**
 * Ajouts rapides : récents absents de la liste, filtrés par la saisie en cours
 * (début d'un mot du libellé).
 */
export function recentSuggestions(state: ShoppingState, query: string, limit = 8): ShoppingRecent[] {
  const inList = new Set(state.extras.map((e) => normalizeName(e.name)));
  const q = normalizeName(query);
  return state.recents
    .filter((r) => !inList.has(normalizeName(r.name)))
    .filter((r) => {
      if (!q) return true;
      const n = normalizeName(r.name);
      return n !== q && (n.startsWith(q) || n.includes(` ${q}`));
    })
    .slice(0, limit);
}
