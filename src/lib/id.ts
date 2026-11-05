/**
 * Identifiants courts, suffisamment uniques pour un usage local (single-user).
 * Pas un vrai UUID — pas besoin ici, et plus court à manipuler.
 */
export function uid(): string {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  );
}
