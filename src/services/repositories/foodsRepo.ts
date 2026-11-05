import { getDB, safeDb } from '../db';
import type { Food } from '@/types';

export const foodsRepo = {
  async all(): Promise<Food[]> {
    return safeDb(async () => (await getDB()).getAll('foods'), [], 'foods.all');
  },
  async get(id: string): Promise<Food | undefined> {
    return safeDb(async () => (await getDB()).get('foods', id), undefined, 'foods.get');
  },
  async put(food: Food): Promise<void> {
    await safeDb(async () => { await (await getDB()).put('foods', food); }, undefined, 'foods.put');
  },
  async bulkPut(foods: Food[]): Promise<void> {
    await safeDb(async () => {
      const db = await getDB();
      const tx = db.transaction('foods', 'readwrite');
      await Promise.all(foods.map((f) => tx.store.put(f)));
      await tx.done;
    }, undefined, 'foods.bulkPut');
  },
  async delete(id: string): Promise<void> {
    await safeDb(async () => { await (await getDB()).delete('foods', id); }, undefined, 'foods.delete');
  }
};
