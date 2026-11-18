import { describe, it, expect } from 'vitest';
import { sanitizeSkips, toggleSkip, skipsFromTomorrow, isRestock, sessionsLeftInRange } from '../shoppingRange';

const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

describe('sanitizeSkips', () => {
  it('garde les jours de la semaine', () => {
    expect([...sanitizeSkips(['2026-11-21', '2026-11-22'], WEEK)]).toEqual(['2026-11-21', '2026-11-22']);
  });
  it('ignore les jours d’une autre semaine et les valeurs invalides', () => {
    expect([...sanitizeSkips(['2026-11-09', 3, '2026-11-17'], WEEK)]).toEqual(['2026-11-17']);
    expect(sanitizeSkips('nope', WEEK).size).toBe(0);
  });
  it('jamais tous les jours retirés', () => {
    expect(sanitizeSkips(WEEK, WEEK).size).toBe(0);
  });
});

describe('toggleSkip', () => {
  it('retire puis remet un jour', () => {
    const a = toggleSkip(new Set(), '2026-11-21', WEEK);
    expect(a.has('2026-11-21')).toBe(true);
    expect(toggleSkip(a, '2026-11-21', WEEK).has('2026-11-21')).toBe(false);
  });
  it('refuse de retirer le dernier jour compté', () => {
    const all = new Set(WEEK.slice(1));
    expect(toggleSkip(all, WEEK[0], WEEK)).toBe(all);
  });
});

describe('skipsFromTomorrow', () => {
  it('retire aujourd’hui et les jours passés', () => {
    expect(skipsFromTomorrow(WEEK, '2026-11-18')).toEqual(WEEK.slice(0, 3));
  });
  it('rien hors de la semaine ou le dernier jour', () => {
    expect(skipsFromTomorrow(WEEK, '2026-11-15')).toEqual([]);
    expect(skipsFromTomorrow(WEEK, '2026-11-22')).toEqual([]);
  });
});

describe('isRestock', () => {
  it('vrai si un jour passé ou aujourd’hui est retiré', () => {
    expect(isRestock(new Set(['2026-11-16']), '2026-11-18')).toBe(true);
    expect(isRestock(new Set(['2026-11-18']), '2026-11-18')).toBe(true);
  });
  it('faux si seuls des jours à venir sont retirés', () => {
    expect(isRestock(new Set(['2026-11-21', '2026-11-22']), '2026-11-18')).toBe(false);
  });
});

describe('sessionsLeftInRange', () => {
  it('déduit les séances déjà faites', () => {
    expect(sessionsLeftInRange(3, 2, 0, 4)).toBe(1);
  });
  it('déduit les séances déjà déclarées dans la période', () => {
    expect(sessionsLeftInRange(3, 0, 1, 4)).toBe(2);
  });
  it('au plus une séance par jour compté', () => {
    expect(sessionsLeftInRange(4, 0, 0, 2)).toBe(2);
  });
  it('jamais négatif', () => {
    expect(sessionsLeftInRange(2, 3, 0, 4)).toBe(0);
  });
});
