import { describe, it, expect } from 'vitest';
import { unseenEntries, latestId, entryDate, type ChangelogEntry } from '../whatsNew';
import { CHANGELOG } from '@/data/changelog';

const E = (id: string): ChangelogEntry => ({ id, title: id, body: '' });
const LIST = [E('2026-11-06-avis'), E('2026-11-18-jours'), E('2026-11-12-liste')];

describe('unseenEntries', () => {
  it('tout, du plus récent au plus ancien, si rien n’a été vu', () => {
    expect(unseenEntries(LIST, undefined).map((e) => e.id)).toEqual(['2026-11-18-jours', '2026-11-12-liste', '2026-11-06-avis']);
  });
  it('seulement ce qui est plus récent que la dernière vue', () => {
    expect(unseenEntries(LIST, '2026-11-12-liste').map((e) => e.id)).toEqual(['2026-11-18-jours']);
  });
  it('rien si la plus récente a été vue', () => {
    expect(unseenEntries(LIST, '2026-11-18-jours')).toEqual([]);
  });
  it('reste juste si l’entrée vue a été retirée de la liste', () => {
    expect(unseenEntries(LIST, '2026-11-10-retiree').map((e) => e.id)).toEqual(['2026-11-18-jours', '2026-11-12-liste']);
  });
});

describe('latestId / entryDate', () => {
  it('la plus récente', () => {
    expect(latestId(LIST)).toBe('2026-11-18-jours');
    expect(latestId([])).toBeUndefined();
  });
  it('date tirée de l’id', () => {
    expect(entryDate(E('2026-11-18-jours'))).toBe('2026-11-18');
  });
});

describe('CHANGELOG', () => {
  it('id au format AAAA-MM-JJ-sujet, uniques', () => {
    const ids = CHANGELOG.map((e) => e.id);
    for (const id of ids) expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
