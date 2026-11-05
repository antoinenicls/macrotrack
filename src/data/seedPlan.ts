import type { PlanTemplateMeal } from '@/types';

/**
 * Plan type par défaut, 3 repas.
 * Quantités cohérentes avec le brief utilisateur.
 */
export const SEED_PLAN_TEMPLATE: PlanTemplateMeal[] = [
  {
    slot: 'petit-dej',
    items: [
      { foodId: 'oeuf-entier',       grams: 150, cooked: false }, // 3 œufs ≈ 150g
      { foodId: 'fromage-blanc-0',   grams: 250, cooked: false },
      { foodId: 'flocons-avoine',    grams: 60,  cooked: false },
      { foodId: 'kiwi',              grams: 80,  cooked: false },
      { foodId: 'banane',            grams: 110, cooked: false }
    ]
  },
  {
    slot: 'dejeuner',
    items: [
      { foodId: 'poulet-blanc-cru',  grams: 180, cooked: false },
      { foodId: 'riz-blanc-sec',     grams: 90,  cooked: false },
      { foodId: 'haricots-verts',    grams: 200, cooked: true  },
      { foodId: 'huile-olive',       grams: 8,   cooked: false }
    ]
  },
  {
    slot: 'diner',
    items: [
      { foodId: 'steak-hache-5-cru', grams: 150, cooked: false },
      { foodId: 'pomme-de-terre-cru',grams: 350, cooked: false },
      { foodId: 'asperges-vertes',   grams: 150, cooked: true  },
      { foodId: 'kiwi',              grams: 140, cooked: false }
    ]
  }
];
