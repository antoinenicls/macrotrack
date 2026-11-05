import { create } from 'zustand';
import type { Meal, MealItem, MealSlot, MealEstimate, PlanTemplateMeal } from '@/types';
import { mealsRepo } from '@/services/repositories';
import { uid } from '@/lib/id';
import { todayKey } from '@/lib/dates';
import { EATEN_OUT_FOOD_ID } from '@/data/eatenOut';

interface LogState {
  /** Date courante affichée (par défaut aujourd'hui). */
  date: string;
  meals: Meal[];
  loading: boolean;

  setDate: (d: string) => Promise<void>;
  loadForDate: (d: string) => Promise<void>;

  addItem: (slot: MealSlot, item: MealItem) => Promise<void>;
  updateItem: (mealId: string, index: number, item: MealItem) => Promise<void>;
  removeItem: (mealId: string, index: number) => Promise<void>;

  /** Ajoute un repas "mangé à l'extérieur" (estimation, sans pesée). */
  addEstimatedMeal: (slot: MealSlot, estimate: MealEstimate) => Promise<void>;

  /** Désactive (retire) un item du plan type déjà coché. */
  uncheckTemplateItem: (foodId: string, slot: MealSlot) => Promise<void>;

  /**
   * Définit la quantité DÉJÀ CONSOMMÉE d'un item du plan (portion fractionnée sur la
   * journée). `consumedGrams <= 0` retire la coche ; sinon crée/met à jour l'item
   * `fromTemplate` avec ces grammes. Le "reste" se déduit de la quantité prévue.
   */
  setTemplatePortion: (slot: MealSlot, foodId: string, consumedGrams: number, cooked: boolean) => Promise<void>;

  /** Snapshot des repas du jour : utilisé pour proposer un undo après opération en lot. */
  snapshot: () => Meal[];
  /** Restaure un snapshot complet (remplace tous les repas du jour). */
  restoreSnapshot: (snap: Meal[]) => Promise<void>;

  /** Remplace les repas du jour par une copie d'une autre date. */
  copyFrom: (sourceDate: string) => Promise<void>;
  /** Ajoute les items du plan type non encore présents (les autres sont conservés). */
  applyTemplate: (template: PlanTemplateMeal[]) => Promise<void>;
}

function findOrCreate(meals: Meal[], date: string, slot: MealSlot): Meal {
  const existing = meals.find((m) => m.slot === slot);
  if (existing) return existing;
  return { id: uid(), date, slot, items: [], createdAt: Date.now() };
}

export const useLogStore = create<LogState>((set, get) => ({
  date: todayKey(),
  meals: [],
  loading: false,

  async setDate(d) {
    set({ date: d });
    await get().loadForDate(d);
  },

  async loadForDate(d) {
    set({ loading: true });
    const raw = await mealsRepo.byDate(d);
    // Auto-réparation : fusionne d'éventuels doublons de repas pour un même slot
    // (séquelles d'un ancien bug de course qui pouvait créer 2 repas pour le même créneau).
    const bySlot = new Map<MealSlot, Meal>();
    const dupes: Meal[] = [];
    for (const m of raw) {
      const existing = bySlot.get(m.slot);
      if (existing) {
        existing.items = [...existing.items, ...m.items];
        dupes.push(m);
      } else {
        bySlot.set(m.slot, { ...m, items: [...m.items] });
      }
    }
    const meals = Array.from(bySlot.values());
    if (dupes.length > 0) {
      for (const m of meals) await mealsRepo.put(m);
      for (const dup of dupes) await mealsRepo.delete(dup.id);
    }
    set({ meals, loading: false });
  },

  // IMPORTANT : on met à jour l'état de façon FONCTIONNELLE (dérivée du state le
  // plus récent) et synchrone, AVANT de persister. Sinon, deux (dé)cochages
  // rapprochés capturent chacun un `meals` périmé (à cause de l'await IndexedDB)
  // et le 2ᵉ `set` écrase le 1ᵉ → des items se cochent/décochent tout seuls.
  async addItem(slot, item) {
    const { date } = get();
    let next: Meal | null = null;
    set((s) => {
      const meal = findOrCreate(s.meals, date, slot);
      next = { ...meal, items: [...meal.items, item] };
      return { meals: [...s.meals.filter((m) => m.id !== meal.id), next] };
    });
    if (next) await mealsRepo.put(next);
  },

  async addEstimatedMeal(slot, estimate) {
    const { date } = get();
    const item: MealItem = { foodId: EATEN_OUT_FOOD_ID, grams: 0, cooked: false, estimate };
    let next: Meal | null = null;
    set((s) => {
      const existing = s.meals.find((m) => m.slot === slot);
      const meal = existing ?? { id: uid(), date, slot, items: [], createdAt: Date.now() };
      // Un seul repas "extérieur" par créneau : on remplace s'il en existe déjà un.
      const idx = meal.items.findIndex((it) => it.estimate);
      const items = idx >= 0 ? meal.items.map((it, i) => (i === idx ? item : it)) : [...meal.items, item];
      next = { ...meal, items };
      return { meals: [...s.meals.filter((m) => m.id !== meal.id), next] };
    });
    if (next) await mealsRepo.put(next);
  },

  async updateItem(mealId, index, item) {
    let next: Meal | null = null;
    set((s) => {
      const meal = s.meals.find((m) => m.id === mealId);
      if (!meal) return {};
      const items = [...meal.items];
      items[index] = item;
      next = { ...meal, items };
      return { meals: s.meals.map((m) => (m.id === mealId ? next! : m)) };
    });
    if (next) await mealsRepo.put(next);
  },

  async removeItem(mealId, index) {
    let next: Meal | null = null;
    set((s) => {
      const meal = s.meals.find((m) => m.id === mealId);
      if (!meal) return {};
      next = { ...meal, items: meal.items.filter((_, i) => i !== index) };
      return { meals: s.meals.map((m) => (m.id === mealId ? next! : m)) };
    });
    if (next) await mealsRepo.put(next);
  },

  async uncheckTemplateItem(foodId, slot) {
    let next: Meal | null = null;
    set((s) => {
      const meal = s.meals.find((m) => m.slot === slot);
      if (!meal) return {};
      // On retire l'occurrence "fromTemplate" pour ce foodId (la 1ère trouvée).
      const idx = meal.items.findIndex((it) => it.foodId === foodId && it.fromTemplate);
      if (idx < 0) return {};
      next = { ...meal, items: meal.items.filter((_, i) => i !== idx) };
      return { meals: s.meals.map((m) => (m.id === meal.id ? next! : m)) };
    });
    if (next) await mealsRepo.put(next);
  },

  async setTemplatePortion(slot, foodId, consumedGrams, cooked) {
    const { date } = get();
    const grams = Math.max(0, Math.round(consumedGrams * 10) / 10); // au 0,1 g près
    let next: Meal | null = null;
    set((s) => {
      const existing = s.meals.find((m) => m.slot === slot);
      const meal = existing ?? { id: uid(), date, slot, items: [], createdAt: Date.now() };
      const idx = meal.items.findIndex((it) => it.foodId === foodId && it.fromTemplate);
      if (grams <= 0 && idx < 0) return {}; // déjà rien : aucun changement
      let items = [...meal.items];
      if (grams <= 0) {
        items = items.filter((_, i) => i !== idx);
      } else if (idx >= 0) {
        items[idx] = { ...items[idx], grams, cooked, fromTemplate: true };
      } else {
        items.push({ foodId, grams, cooked, fromTemplate: true });
      }
      next = { ...meal, items };
      return { meals: [...s.meals.filter((m) => m.id !== meal.id), next] };
    });
    if (next) await mealsRepo.put(next);
  },

  snapshot() {
    // Clone profond minimal — items sont des objets simples (foodId/grams/cooked/fromTemplate)
    return get().meals.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }));
  },

  async restoreSnapshot(snap) {
    const { date } = get();
    await mealsRepo.deleteByDate(date);
    const cloned = snap.map((m) => ({ ...m, items: m.items.map((it) => ({ ...it })) }));
    for (const m of cloned) await mealsRepo.put(m);
    set({ meals: cloned });
  },

  async copyFrom(sourceDate) {
    const { date } = get();
    const source = await mealsRepo.byDate(sourceDate);
    await mealsRepo.deleteByDate(date);
    const cloned: Meal[] = source.map((m) => ({
      id: uid(),
      date,
      slot: m.slot,
      items: m.items.map((it) => ({ ...it, fromTemplate: false })),
      createdAt: Date.now()
    }));
    for (const m of cloned) await mealsRepo.put(m);
    set({ meals: cloned });
  },

  async applyTemplate(template) {
    const { date, meals } = get();
    const result: Meal[] = [...meals];
    for (const tpl of template) {
      const existing = result.find((m) => m.slot === tpl.slot);
      const items: MealItem[] = tpl.items.map((it) => ({
        foodId: it.foodId,
        grams: it.grams,
        cooked: it.cooked,
        fromTemplate: true
      }));
      if (existing) {
        const known = new Set(existing.items.map((i) => i.foodId));
        const merged = { ...existing, items: [...existing.items, ...items.filter((i) => !known.has(i.foodId))] };
        await mealsRepo.put(merged);
        const idx = result.findIndex((m) => m.id === existing.id);
        result[idx] = merged;
      } else {
        const meal: Meal = { id: uid(), date, slot: tpl.slot, items, createdAt: Date.now() };
        await mealsRepo.put(meal);
        result.push(meal);
      }
    }
    set({ meals: result });
  }
}));
