/* =========================================================================
 *  « Quoi de neuf » : nouveautés pas encore vues, montrées une fois à l'ouverture.
 *
 *  Les entrées sont écrites à la main (une par nouveauté visible, pas une par commit)
 *  et identifiées par `AAAA-MM-JJ-sujet` : l'ordre des id suit l'ordre chronologique,
 *  ce qui permet de retrouver « ce qui est plus récent que la dernière vue » même si
 *  une ancienne entrée est retirée de la liste. Pur, sans I/O.
 * ========================================================================= */

export interface ChangelogEntry {
  /** `AAAA-MM-JJ-sujet`, unique et triable. */
  id: string;
  title: string;
  body: string;
}

/** Au-delà, la fenêtre propose « Voir les N autres » plutôt qu'un mur de texte. */
export const WHATS_NEW_MAX = 3;

/** Date (`AAAA-MM-JJ`) d'une entrée, tirée de son id. */
export function entryDate(entry: ChangelogEntry): string {
  return entry.id.slice(0, 10);
}

/** Entrées triées de la plus récente à la plus ancienne. */
export function sortedEntries(entries: ChangelogEntry[]): ChangelogEntry[] {
  return [...entries].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

/** Entrées plus récentes que la dernière vue (toutes si rien n'a jamais été vu). */
export function unseenEntries(entries: ChangelogEntry[], seenId: string | undefined): ChangelogEntry[] {
  return sortedEntries(entries).filter((e) => !seenId || e.id > seenId);
}

/** Id à mémoriser une fois la fenêtre fermée : la plus récente entrée. */
export function latestId(entries: ChangelogEntry[]): string | undefined {
  return sortedEntries(entries)[0]?.id;
}
