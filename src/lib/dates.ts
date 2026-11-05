import { format, parseISO, subDays, addDays, startOfWeek, differenceInCalendarDays } from 'date-fns';
import { fr } from 'date-fns/locale';

/** Clé de jour locale, format `YYYY-MM-DD`. C'est notre identifiant canonique d'une journée. */
export function dayKey(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd');
}

export function parseDayKey(key: string): Date {
  return parseISO(key);
}

export function todayKey(): string {
  return dayKey();
}

export function yesterdayKey(): string {
  return dayKey(subDays(new Date(), 1));
}

export function formatHumanDate(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return format(date, "EEEE d MMMM", { locale: fr });
}

export function formatShortDate(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d;
  return format(date, 'd MMM', { locale: fr });
}

export function lastNDays(n: number, from: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = n - 1; i >= 0; i--) days.push(dayKey(subDays(from, i)));
  return days;
}

export { subDays, addDays, startOfWeek, differenceInCalendarDays };
