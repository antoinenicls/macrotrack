import type { ChangelogEntry } from '@/lib/whatsNew';

/**
 * Nouveautés montrées dans « Quoi de neuf » (voir `lib/whatsNew.ts`).
 *
 * Une entrée par nouveauté VISIBLE pour l'utilisateur, écrite pour lui : un titre court,
 * une ou deux phrases. Pas les petites retouches ni les corrections internes.
 * Id : `AAAA-MM-JJ-sujet` (date du jour où c'est sorti). La plus récente en haut.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-11-18-quoi-de-neuf',
    title: "Les nouveautés, à l'ouverture",
    body: "Les nouveautés s'affichent ici à l'ouverture, une seule fois. Tu les retrouves dans Plan › Réglages."
  },
  {
    id: '2026-11-18-courses-jours',
    title: 'Liste de courses : choisis les jours',
    body: "Touche un jour pour le retirer : courses en milieu de semaine, resto, week-end à l'extérieur. Les quantités suivent."
  },
  {
    id: '2026-11-12-courses-articles',
    title: 'Une seule liste de courses',
    body: "Ajoute ce qui n'est pas dans ton plan (café, hygiène, entretien…) : chaque article se range dans son rayon."
  },
  {
    id: '2026-11-06-avis',
    title: 'Donne ton avis',
    body: 'Une idée, un bug ? « Donner mon avis » dans les Réglages et en bas des Explications.'
  }
];
