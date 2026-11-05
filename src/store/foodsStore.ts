import { create } from 'zustand';
import type { Food, Combo } from '@/types';
import { foodsRepo, combosRepo } from '@/services/repositories';
import { uid } from '@/lib/id';

interface FoodsState {
  foods: Food[];
  combos: Combo[];
  loaded: boolean;
  load: () => Promise<void>;
  upsertFood: (f: Omit<Food, 'createdAt'> & { createdAt?: number }) => Promise<Food>;
  deleteFood: (id: string) => Promise<Food | undefined>;
  restoreFood: (f: Food) => Promise<void>;
  upsertCombo: (c: Omit<Combo, 'id' | 'createdAt'> & { id?: string }) => Promise<Combo>;
  deleteCombo: (id: string) => Promise<Combo | undefined>;
  restoreCombo: (c: Combo) => Promise<void>;
  /** Accès rapide id → Food (mémoïsé via Map). */
  byId: (id: string) => Food | undefined;
}

export const useFoodsStore = create<FoodsState>((set, get) => {
  let cache: Map<string, Food> | null = null;
  const rebuild = (list: Food[]) => { cache = new Map(list.map((f) => [f.id, f])); };

  return {
    foods: [],
    combos: [],
    loaded: false,
    async load() {
      const [foods, combos] = await Promise.all([foodsRepo.all(), combosRepo.all()]);
      rebuild(foods);
      set({ foods, combos, loaded: true });
    },
    async upsertFood(f) {
      const food: Food = { ...f, createdAt: f.createdAt ?? Date.now() };
      await foodsRepo.put(food);
      const next = [...get().foods.filter((x) => x.id !== food.id), food];
      rebuild(next);
      set({ foods: next });
      return food;
    },
    async deleteFood(id) {
      const entry = get().foods.find((f) => f.id === id);
      await foodsRepo.delete(id);
      const next = get().foods.filter((f) => f.id !== id);
      rebuild(next);
      set({ foods: next });
      return entry;
    },
    async restoreFood(food) {
      await foodsRepo.put(food);
      const next = [...get().foods.filter((f) => f.id !== food.id), food];
      rebuild(next);
      set({ foods: next });
    },
    async upsertCombo(c) {
      const combo: Combo = { id: c.id ?? uid(), name: c.name, items: c.items, createdAt: Date.now() };
      await combosRepo.put(combo);
      const next = [...get().combos.filter((x) => x.id !== combo.id), combo];
      set({ combos: next });
      return combo;
    },
    async deleteCombo(id) {
      const entry = get().combos.find((c) => c.id === id);
      await combosRepo.delete(id);
      set({ combos: get().combos.filter((c) => c.id !== id) });
      return entry;
    },
    async restoreCombo(combo) {
      await combosRepo.put(combo);
      set({ combos: [...get().combos.filter((c) => c.id !== combo.id), combo] });
    },
    byId(id) {
      if (!cache) rebuild(get().foods);
      return cache!.get(id);
    }
  };
});
