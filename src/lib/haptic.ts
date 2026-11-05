/**
 * Helper retour haptique cross-platform.
 *
 * État actuel des plateformes :
 *  - Android (Chromium) : `navigator.vibrate(ms | number[])` supporté → fonctionne.
 *  - iOS Safari / PWA   : non supporté, retourne false. Le code devient un no-op,
 *    sans erreur. Le feedback visuel (scale active:, transitions) prend le relais.
 *  - Desktop            : généralement non supporté.
 *
 * On modèle 7 types d'événements inspirés de UIKit `UIImpactFeedbackGenerator` /
 * `UINotificationFeedbackGenerator`, qu'on traduit en patterns de vibration.
 * Si Apple débloque l'API un jour, il suffira d'adapter cette fonction.
 */

export type HapticKind =
  | 'selection'  // bascule, scroll snap
  | 'light'      // tap léger, ouverture sheet
  | 'medium'     // confirmation
  | 'heavy'      // action critique
  | 'success'    // succès (ajout, save)
  | 'warning'    // avertissement
  | 'error';     // erreur / refus

// Patterns en ms — courts pour rester discrets.
const PATTERNS: Record<HapticKind, number | number[]> = {
  selection: 5,
  light:     8,
  medium:    14,
  heavy:     22,
  success:   [8, 30, 16],
  warning:   [12, 40, 12],
  error:     [22, 40, 22, 40, 22]
};

let enabled = true;

export function setHapticEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function haptic(kind: HapticKind = 'selection'): boolean {
  if (!enabled) return false;
  if (!isHapticSupported()) return false;
  try {
    return navigator.vibrate(PATTERNS[kind]);
  } catch {
    return false;
  }
}
