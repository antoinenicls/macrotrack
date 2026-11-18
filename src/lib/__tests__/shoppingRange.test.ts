import { describe, it, expect } from 'vitest';
import {
  remainingStartOptions, defaultRemainingStart, validRemainingStart, validRemainingEnd, sessionsLeftInRange
} from '../shoppingRange';

const WEEK = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

describe('remainingStartOptions', () => {
  it('propose aujourd’hui puis les jours suivants', () => {
    expect(remainingStartOptions(WEEK, '2026-11-18')).toEqual(WEEK.slice(2));
  });
  it('rien hors de la semaine affichée (week-end → semaine suivante)', () => {
    expect(remainingStartOptions(WEEK, '2026-11-15')).toEqual([]);
  });
  it('rien le dernier jour', () => {
    expect(remainingStartOptions(WEEK, '2026-11-22')).toEqual([]);
  });
});

describe('defaultRemainingStart', () => {
  it('demain par défaut', () => {
    expect(defaultRemainingStart(WEEK.slice(2), '2026-11-18')).toBe('2026-11-19');
  });
  it('aucune option → null', () => {
    expect(defaultRemainingStart([], '2026-11-18')).toBeNull();
  });
});

describe('validRemainingStart', () => {
  it('garde un départ encore proposé', () => {
    expect(validRemainingStart('2026-11-20', WEEK.slice(2))).toBe('2026-11-20');
  });
  it('oublie un départ passé', () => {
    expect(validRemainingStart('2026-11-17', WEEK.slice(2))).toBeNull();
  });
});

describe('validRemainingEnd', () => {
  const opts = WEEK.slice(2);
  it('garde une fin après le départ', () => {
    expect(validRemainingEnd('2026-11-20', opts, '2026-11-18')).toBe('2026-11-20');
  });
  it('fin le jour même du départ', () => {
    expect(validRemainingEnd('2026-11-18', opts, '2026-11-18')).toBe('2026-11-18');
  });
  it('oublie une fin avant le départ', () => {
    expect(validRemainingEnd('2026-11-19', opts, '2026-11-20')).toBeNull();
  });
  it('sans départ → null', () => {
    expect(validRemainingEnd('2026-11-20', opts, null)).toBeNull();
  });
});

describe('sessionsLeftInRange', () => {
  it('déduit les séances déjà faites', () => {
    expect(sessionsLeftInRange(3, 2, 0, 4)).toBe(1);
  });
  it('déduit les séances déjà déclarées dans la période', () => {
    expect(sessionsLeftInRange(3, 0, 1, 4)).toBe(2);
  });
  it('au plus une séance par jour restant', () => {
    expect(sessionsLeftInRange(4, 0, 0, 2)).toBe(2);
  });
  it('jamais négatif', () => {
    expect(sessionsLeftInRange(2, 3, 0, 4)).toBe(0);
  });
});
