import { useEffect, useMemo, useRef } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dayKey, addDays, parseDayKey, todayKey, startOfWeek } from '@/lib/dates';
import { haptic } from '@/lib/haptic';

interface Props {
  selectedDate: string;
  onSelect: (date: string) => void;
  /** Nombre de semaines affichées à partir du lundi en cours (par défaut 2). */
  weeks?: number;
}

/**
 * Bande de jours scrollable horizontalement.
 *  - Démarre TOUJOURS au lundi de la semaine en cours (jamais avant) et couvre
 *    `weeks` semaines pleines (lundi → dimanche). Par défaut 2 semaines :
 *    semaine en cours + semaine suivante, pour préparer les repas à venir.
 *  - On ne peut pas remonter avant ce lundi : les jours déjà passés des semaines
 *    précédentes ne sont plus affichés (ils ne servent plus).
 *  - Tap → change de jour.
 *  - Auto-scroll pour garder le jour sélectionné visible et centré.
 */
export function DayStrip({ selectedDate, onSelect, weeks = 2 }: Props) {
  const today = todayKey();
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    return Array.from({ length: weeks * 7 }, (_, i) => dayKey(addDays(monday, i)));
  }, [weeks]);

  // Auto-scroll : centre le jour sélectionné dans la fenêtre visible
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLButtonElement>(`[data-day="${selectedDate}"]`);
    if (!el) return;
    const cw = container.clientWidth;
    const target = el.offsetLeft - cw / 2 + el.clientWidth / 2;
    container.scrollTo({ left: target, behavior: 'smooth' });
  }, [selectedDate]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto -mx-4 px-4 py-1"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      <style>{`.day-strip::-webkit-scrollbar{display:none}`}</style>
      {days.map((d) => {
        const isSelected = d === selectedDate;
        const isToday = d === today;
        const isPast = d < today;
        const date = parseDayKey(d);
        return (
          <button
            key={d}
            data-day={d}
            onClick={() => { if (!isSelected) haptic('selection'); onSelect(d); }}
            className={[
              'shrink-0 flex flex-col items-center justify-center w-12 h-14 rounded-2xl tap no-select transition-colors',
              isSelected
                ? 'bg-brand text-white'
                : isPast
                  ? 'bg-surface-hi text-text-muted active:text-text'
                  : 'bg-surface-hi text-text active:bg-surface',
              !isSelected && isToday ? 'ring-1 ring-brand/60' : ''
            ].join(' ')}
          >
            <span className="text-[10px] uppercase tracking-wide leading-none mb-1">
              {format(date, 'EEE', { locale: fr }).slice(0, 3)}
            </span>
            <span className="text-base font-bold leading-none">{format(date, 'd')}</span>
          </button>
        );
      })}
    </div>
  );
}
