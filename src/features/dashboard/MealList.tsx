import { Card } from '@/components/ui';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { MEAL_LABEL, MEAL_SLOTS, type Meal } from '@/types';
import { useFoodsStore } from '@/store/foodsStore';
import { macrosForItem, sumMacros, ZERO_MACROS } from '@/lib/nutrition';
import { fmtKcal } from '@/lib/format';

interface Props {
  meals: Meal[];
}

export function MealList({ meals }: Props) {
  const byId = useFoodsStore((s) => s.byId);

  return (
    <div className="space-y-3">
      {MEAL_SLOTS.map((slot) => {
        const meal = meals.find((m) => m.slot === slot);
        const totals = meal
          ? sumMacros(meal.items.map((it) => macrosForItem(byId(it.foodId), it)))
          : ZERO_MACROS;
        const count = meal?.items.length ?? 0;
        return (
          <Link key={slot} to={`/log?slot=${slot}`} className="block">
            <Card className="flex items-center gap-3 active:bg-surface-hi transition-colors">
              <div className="flex-1">
                <div className="font-semibold">{MEAL_LABEL[slot]}</div>
                <div className="text-xs text-text-muted mt-0.5">
                  {count === 0 ? 'Aucun aliment' : `${count} aliment${count > 1 ? 's' : ''} • ${fmtKcal(totals.kcal)}`}
                </div>
              </div>
              {count === 0 ? (
                <span className="inline-flex items-center gap-1 text-brand text-sm font-medium">
                  <Plus size={16} /> Ajouter
                </span>
              ) : (
                <ChevronRight className="text-text-muted" size={20} />
              )}
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

