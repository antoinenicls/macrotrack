import { useMemo, useState } from 'react';
import { Sheet, Input, SegmentedControl, EmptyState } from '@/components/ui';
import { useFoodsStore } from '@/store/foodsStore';
import type { Food, FoodCategory } from '@/types';
import { Apple } from 'lucide-react';

type Filter = 'all' | FoodCategory;

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (food: Food) => void;
}

export function FoodSearchSheet({ open, onClose, onPick }: Props) {
  const foods = useFoodsStore((s) => s.foods);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return foods
      .filter((f) => (filter === 'all' ? true : f.category === filter))
      .filter((f) => (term === '' ? true : f.name.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [foods, q, filter]);

  return (
    <Sheet open={open} onClose={onClose} title="Choisir un aliment" fullScreen>
      <div className="space-y-3">
        <Input
          placeholder="Rechercher…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus={false}
        />
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'proteine', label: 'Prot.' },
            { value: 'glucide', label: 'Gluc.' },
            { value: 'lipide', label: 'Lip.' },
            { value: 'legume', label: 'Lég.' },
            { value: 'fruit', label: 'Fruits' }
          ]}
        />

        {filtered.length === 0 ? (
          <EmptyState icon={<Apple size={32} />} title="Aucun résultat" description="Affine ta recherche. Si tu as mangé dehors, utilise plutôt « J'ai mangé à l'extérieur »." />
        ) : (
          <ul className="divide-y divide-border rounded-2xl bg-surface-hi overflow-hidden">
            {filtered.map((f) => (
              <li key={f.id}>
                <button
                  className="w-full text-left px-3 py-3 active:bg-surface tap"
                  onClick={() => onPick(f)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-xs text-text-muted">{f.kcalPer100g} kcal/100g</span>
                  </div>
                  <div className="text-xs text-text-muted mt-0.5">
                    P {f.proteinPer100g} • G {f.carbsPer100g} • L {f.fatPer100g}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
