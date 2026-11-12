import { describe, it, expect } from 'vitest';
import {
  addExtra, guessAisle, normalizeName, purgeBought, recentSuggestions, editExtra,
  setExtraChecked, uncheckAllExtras, forgetRecent, isInList, type ShoppingState
} from '../shoppingExtras';

const empty: ShoppingState = { extras: [], recents: [] };

describe('guessAisle', () => {
  it.each([
    ['Capsules café', 'boissons'],
    ['Thé vert', 'boissons'],
    ['Déodorant', 'hygiene'],
    ['Gel douche', 'hygiene'],
    ['Crème hydratante', 'hygiene'],
    ['Lait corporel', 'hygiene'],
    ['Nettoyant salle de bain', 'entretien'],
    ['Liquide vaisselle', 'entretien'],
    ['Sacs poubelle', 'entretien'],
    ['Crème fraîche', 'cremerie'],
    ["Lait d'amande", 'cremerie'],
    ['Yaourts', 'cremerie'],
    ['Pommes de terre', 'produce'],
    ['Baguette', 'boulangerie'],
    ['Vinaigre', 'epicerie-salee'],
    ['Truc bizarre', 'divers'],
    ['', 'divers']
  ])('%s → %s', (name, aisle) => {
    expect(guessAisle(name)).toBe(aisle);
  });

  it('un article déjà acheté reprend le rayon choisi', () => {
    expect(guessAisle('capsules CAFÉ', [{ name: 'Capsules café', aisle: 'divers' }])).toBe('divers');
  });
});

describe('normalizeName', () => {
  it('minuscule, sans accents, ponctuation ni œ', () => {
    expect(normalizeName("  Œufs  d'Été ! ")).toBe('oeufs d ete');
  });
});

describe('addExtra', () => {
  it('ajoute avec rayon deviné et alimente les récents', () => {
    const r = addExtra(empty, '  capsules   café ', 'a', 1);
    expect(r.status).toBe('added');
    if (r.status !== 'added') return;
    expect(r.extra).toMatchObject({ id: 'a', name: 'Capsules café', aisle: 'boissons' });
    expect(r.state.recents).toEqual([{ name: 'Capsules café', aisle: 'boissons' }]);
  });

  it('ignore une saisie vide', () => {
    expect(addExtra(empty, '   ', 'a', 1).status).toBe('empty');
  });

  it('ne double pas un article, et le remet « à prendre » s’il était dans le panier', () => {
    const first = addExtra(empty, 'Déodorant', 'a', 1);
    if (first.status !== 'added') throw new Error();
    const checked = { ...first.state, extras: setExtraChecked(first.state.extras, 'a', '2026-11-09') };
    const again = addExtra(checked, 'deodorant', 'b', 2);
    expect(again.status).toBe('duplicate');
    expect(again.state.extras).toHaveLength(1);
    expect(again.state.extras[0].checkedWeek).toBeUndefined();
  });
});

describe('purgeBought', () => {
  const extras = [
    { id: 'old', name: 'A', aisle: 'divers' as const, addedAt: 1, checkedWeek: '2026-11-02' },
    { id: 'now', name: 'B', aisle: 'divers' as const, addedAt: 1, checkedWeek: '2026-11-09' },
    { id: 'todo', name: 'C', aisle: 'divers' as const, addedAt: 1 }
  ];
  it('retire les articles pris une semaine précédente, garde le reste', () => {
    expect(purgeBought(extras, '2026-11-09').map((e) => e.id)).toEqual(['now', 'todo']);
  });
  it('renvoie le même tableau si rien ne change', () => {
    const kept = extras.slice(1);
    expect(purgeBought(kept, '2026-11-09')).toBe(kept);
  });
});

describe('editExtra / recentSuggestions / uncheckAll', () => {
  const base = addExtra(empty, 'Capsules café', 'a', 1);
  if (base.status !== 'added') throw new Error();

  it('le rayon modifié est retenu pour la prochaine fois', () => {
    const s = editExtra(base.state, 'a', { aisle: 'divers' });
    expect(s.extras[0].aisle).toBe('divers');
    expect(guessAisle('Capsules café', s.recents)).toBe('divers');
  });

  it('renommer remplace l’ancien récent', () => {
    const s = editExtra(base.state, 'a', { name: 'Capsules café x2' });
    expect(s.recents.map((r) => r.name)).toEqual(['Capsules café x2']);
  });

  it('les suggestions excluent ce qui est déjà dans la liste et filtrent la saisie', () => {
    const state: ShoppingState = {
      extras: base.state.extras,
      recents: [
        { name: 'Capsules café', aisle: 'boissons' },
        { name: 'Déodorant', aisle: 'hygiene' },
        { name: 'Gel douche', aisle: 'hygiene' }
      ]
    };
    expect(recentSuggestions(state, '').map((r) => r.name)).toEqual(['Déodorant', 'Gel douche']);
    expect(recentSuggestions(state, 'dou').map((r) => r.name)).toEqual(['Gel douche']);
  });

  it('tout décocher', () => {
    const checked = setExtraChecked(base.state.extras, 'a', '2026-11-09');
    expect(uncheckAllExtras(checked)[0].checkedWeek).toBeUndefined();
  });
});

describe('forgetRecent / isInList', () => {
  const recents = [{ name: 'Capsules café', aisle: 'boissons' as const }, { name: 'Déodorant', aisle: 'hygiene' as const }];
  it('oublie un récent sans tenir compte de la casse ni des accents', () => {
    expect(forgetRecent(recents, 'deodorant').map((r) => r.name)).toEqual(['Capsules café']);
  });
  it('renvoie le même tableau si rien à oublier', () => {
    expect(forgetRecent(recents, 'Lessive')).toBe(recents);
  });
  it('isInList', () => {
    const extras = [{ id: 'a', name: 'Capsules café', aisle: 'boissons' as const, addedAt: 1 }];
    expect(isInList(extras, 'capsules CAFE')).toBe(true);
    expect(isInList(extras, 'Déodorant')).toBe(false);
  });
});
