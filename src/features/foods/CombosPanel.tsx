import { useEffect, useState } from 'react';
import { Button, Sheet, Input, NumberInput, EmptyState, SwipeAction } from '@/components/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useFoodsStore } from '@/store/foodsStore';
import { useUIStore } from '@/store/uiStore';
import { FoodSearchSheet } from '@/features/nutrition/FoodSearchSheet';
import type { Combo, Food } from '@/types';
import { macrosForItem, sumMacros } from '@/lib/nutrition';
import { fmtG, fmtKcal } from '@/lib/format';

export function CombosPanel() {
  const combos = useFoodsStore((s) => s.combos);
  const upsertCombo = useFoodsStore((s) => s.upsertCombo);
  const deleteCombo = useFoodsStore((s) => s.deleteCombo);
  const restoreCombo = useFoodsStore((s) => s.restoreCombo);
  const byId = useFoodsStore((s) => s.byId);
  const toast = useUIStore((s) => s.toast);
  const [editor, setEditor] = useState<Combo | 'new' | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm uppercase tracking-wide text-text-muted">Repas favoris / combos</h2>
        <Button size="sm" variant="secondary" leadingIcon={<Plus size={16} />} onClick={() => setEditor('new')}>Nouveau</Button>
      </div>

      {combos.length === 0 ? (
        <EmptyState title="Aucun combo" description="Crée un combo pour réutiliser un repas en 1 tap (ex: 'Petit-déj type')." />
      ) : (
        <ul className="space-y-2">
          {combos.map((c) => {
            const totals = sumMacros(c.items.map((it) => macrosForItem(byId(it.foodId), { foodId: it.foodId, grams: it.grams, cooked: !!it.cooked })));
            return (
              <li key={c.id}>
                <SwipeAction onDelete={async () => {
                  const removed = await deleteCombo(c.id);
                  toast('Combo supprimé', 'success', {
                    action: { label: 'Annuler', onPress: () => removed && restoreCombo(removed) }
                  });
                }}>
                  <button className="w-full text-left px-3 py-3" onClick={() => setEditor(c)}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-text-muted">{c.items.length} aliments</span>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {fmtKcal(totals.kcal)} • P {fmtG(totals.protein)} • G {fmtG(totals.carbs)} • L {fmtG(totals.fat)}
                    </div>
                  </button>
                </SwipeAction>
              </li>
            );
          })}
        </ul>
      )}

      <ComboEditor
        combo={editor}
        onClose={() => setEditor(null)}
        onSave={async (name, items) => {
          await upsertCombo({ id: editor !== 'new' && editor ? editor.id : undefined, name, items });
          setEditor(null);
        }}
      />
    </div>
  );
}

function ComboEditor({
  combo,
  onClose,
  onSave
}: {
  combo: Combo | 'new' | null;
  onClose: () => void;
  onSave: (name: string, items: Combo['items']) => Promise<void>;
}) {
  const open = combo !== null;
  const editing = combo !== 'new' && combo !== null ? combo : null;
  const [name, setName] = useState(editing?.name ?? '');
  const [items, setItems] = useState<Combo['items']>(editing?.items ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const byId = useFoodsStore((s) => s.byId);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setItems(editing?.items ?? []);
    }
  }, [open, editing]);

  const onPick = (f: Food) => {
    setItems((arr) => [...arr, { foodId: f.id, grams: 100, cooked: false }]);
    setPickerOpen(false);
  };

  return (
    <>
      <Sheet open={open} onClose={onClose} title={editing ? 'Modifier le combo' : 'Nouveau combo'}>
        <div className="space-y-4">
          <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Petit-déj type" />

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-text-muted">Aliments</span>
              <Button size="sm" variant="secondary" leadingIcon={<Plus size={14} />} onClick={() => setPickerOpen(true)}>Ajouter</Button>
            </div>
            <ul className="space-y-2">
              {items.map((it, idx) => (
                <li key={idx} className="bg-surface-hi rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{byId(it.foodId)?.name ?? it.foodId}</span>
                    <button onClick={() => setItems(items.filter((_, i) => i !== idx))} aria-label="Supprimer">
                      <Trash2 size={16} className="text-danger" />
                    </button>
                  </div>
                  <NumberInput
                    value={it.grams}
                    onChange={(v) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], grams: typeof v === 'number' ? v : 0 };
                      setItems(next);
                    }}
                    suffix="g"
                  />
                </li>
              ))}
            </ul>
          </div>

          <Button block onClick={() => onSave(name.trim(), items)} disabled={!name.trim() || items.length === 0}>
            Enregistrer
          </Button>
        </div>
      </Sheet>

      <FoodSearchSheet open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={onPick} />
    </>
  );
}
