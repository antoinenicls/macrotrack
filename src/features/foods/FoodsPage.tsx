import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input, SegmentedControl } from '@/components/ui';
import { useFoodsStore } from '@/store/foodsStore';
import type { FoodCategory } from '@/types';

type Filter = 'all' | FoodCategory;

/**
 * Onglet Aliments = consultation seule de la base de données.
 * Pas de création / édition / suppression : on regarde juste les valeurs.
 */
export function FoodsPage() {
  const foods = useFoodsStore((s) => s.foods);

  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return foods
      .filter((f) => (filter === 'all' ? true : f.category === filter))
      .filter((f) => (term === '' ? true : f.name.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [foods, q, filter]);

  return (
    <div className="space-y-4 px-5 pb-5">
      <PageHeader
        title="Aliments"
        subtitle="Base de données"
      />

      <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
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

      <ul className="space-y-2">
        {list.map((f) => (
          <li key={f.id} className="px-3 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium min-w-0 leading-snug break-words">{f.name}</span>
                {f.isCustom && <span className="shrink-0 text-[10px] uppercase text-brand">Custom</span>}
              </div>
              <div className="text-xs text-text-muted mt-0.5">
                {f.kcalPer100g} kcal • P {f.proteinPer100g} • G {f.carbsPer100g} • L {f.fatPer100g} (/ 100g {f.state === 'cooked' ? 'cuit' : ''})
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
