/**
 * Notifications locales — best-effort.
 *
 * iOS Safari ne supporte les Web Notifications que pour les PWA *installées*
 * depuis iOS 16.4+. Sur Android/Desktop le support est large.
 * On expose une API simple pour demander la permission et programmer un rappel
 * journalier via setTimeout (donc actif uniquement quand l'app est ouverte).
 * Pour de vrais rappels en arrière-plan il faudrait un push backend — hors MVP.
 */

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  return Notification.requestPermission();
}

export function canNotify(): boolean {
  return 'Notification' in window && Notification.permission === 'granted';
}

export function notify(title: string, body: string): void {
  if (!canNotify()) return;
  try {
    new Notification(title, { body, icon: '/pwa-192x192.png', badge: '/pwa-64x64.png' });
  } catch (e) {
    console.warn('[notify] failed', e);
  }
}

let timers: number[] = [];

/** Programme un rappel à une heure HH:MM, répété chaque jour tant que l'app tourne. */
export function scheduleDailyReminder(hhmm: string, title: string, body: string): void {
  const [h, m] = hhmm.split(':').map(Number);
  const fire = () => {
    notify(title, body);
    timers.push(window.setTimeout(fire, 24 * 60 * 60 * 1000));
  };
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  timers.push(window.setTimeout(fire, next.getTime() - now.getTime()));
}

export function clearReminders(): void {
  timers.forEach((t) => clearTimeout(t));
  timers = [];
}
