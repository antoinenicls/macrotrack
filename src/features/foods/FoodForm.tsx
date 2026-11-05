import { useEffect, useState } from 'react';
import { Sheet, Input, NumberInput, Button, SegmentedControl } from '@/components/ui';
import { useFoodsStore } from '@/store/foodsStore';
import { useUIStore } from '@/store/uiStore';
import type { Food, FoodCategory, FoodServing, Nutrient, FoodTag } from '@/types';
import { uid } from '@/lib/id';
import { NUTRIENT_META, NUTRIENT_ORDER } from '@/lib/coverage';
import { TAG_LABEL, TAG_ORDER } from '@/lib/diet';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  food: Food | null;
  onClose: () => void;
  /** Catégorie pré-sélectionnée à la création (ex. depuis un groupe de « Mes aliments »). */
  presetCategory?: FoodCategory;
  /** Appelé après enregistrement, avec l'aliment créé/modifié. */
  onSaved?: (food: Food) => void;
  /** Autorise la suppression (réservée aux aliments ajoutés par l'utilisateur). */
  canDelete?: boolean;
  /** Appelé après suppression, avec l'id supprimé. */
  onDeleted?: (id: string) => void;
}

const CATS: FoodCategory[] = ['proteine', 'glucide', 'lipide', 'legume', 'fruit', 'autre'];
const CAT_LABEL: Record<FoodCategory, string> = {
  proteine: 'Protéine', glucide: 'Glucide', lipide: 'Lipide', legume: 'Légume', fruit: 'Fruit', autre: 'Autre'
};

export function FoodForm({ open, food, onClose, presetCategory, onSaved, canDelete, onDeleted }: Props) {
  const upsert = useFoodsStore((s) => s.upsertFood);
  const removeFood = useFoodsStore((s) => s.deleteFood);
  const toast = useUIStore((s) => s.toast);

  const [name, setName] = useState('');
  const [category, setCategory] = useState<FoodCategory>('autre');
  const [kcal, setKcal] = useState<number | ''>('');
  const [p, setP] = useState<number | ''>('');
  const [g, setG] = useState<number | ''>('');
  const [l, setL] = useState<number | ''>('');
  const [state, setState] = useState<'raw' | 'cooked'>('raw');
  const [cookedFactor, setCookedFactor] = useState<number | ''>('');
  const [servings, setServings] = useState<FoodServing[]>([]);
  const [nutrients, setNutrients] = useState<Nutrient[]>([]);
  const [tags, setTags] = useState<FoodTag[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(food?.name ?? '');
    setCategory(food?.category ?? presetCategory ?? 'autre');
    setKcal(food?.kcalPer100g ?? '');
    setP(food?.proteinPer100g ?? '');
    setG(food?.carbsPer100g ?? '');
    setL(food?.fatPer100g ?? '');
    setState(food?.state ?? 'raw');
    setCookedFactor(food?.cookedFactor ?? '');
    setServings(food?.commonServings ?? []);
    setNutrients(food?.nutrients ?? []);
    setTags(food?.tags ?? []);
  }, [open, food]);

  const canSave = name.trim() && typeof kcal === 'number' && typeof p === 'number' && typeof g === 'number' && typeof l === 'number';

  const save = async () => {
    if (!canSave) return;
    const next: Omit<Food, 'createdAt'> = {
      id: food?.id ?? uid(),
      name: name.trim(),
      category,
      kcalPer100g: kcal as number,
      proteinPer100g: p as number,
      carbsPer100g: g as number,
      fatPer100g: l as number,
      state,
      cookedFactor: typeof cookedFactor === 'number' && cookedFactor > 0 ? cookedFactor : undefined,
      commonServings: servings.filter((s) => s.label.trim() && s.grams > 0),
      // Conserve le plafond de portion d'origine quand on édite un aliment du seed :
      // c'est un garde-fou du solveur, pas un réglage utilisateur.
      portionMaxG: food?.portionMaxG,
      nutrients: nutrients.length > 0 ? nutrients : undefined,
      tags: tags.length > 0 ? tags : undefined,
      isCustom: true
    };
    const saved = await upsert(next);
    onSaved?.(saved);
    toast(food ? 'Aliment modifié' : 'Aliment créé', 'success');
    onClose();
  };

  const remove = async () => {
    if (!food) return;
    if (!confirm(`Supprimer « ${food.name} » ? Cette action est irréversible.`)) return;
    await removeFood(food.id);
    onDeleted?.(food.id);
    toast('Aliment supprimé', 'success');
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={food ? 'Modifier' : 'Nouvel aliment'}>
      <div className="space-y-4">
        <Input label="Nom" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Yaourt nature" />

        <div>
          <span className="block text-sm text-text-muted mb-1.5">Catégorie</span>
          <div className="grid grid-cols-3 gap-1.5">
            {CATS.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={[
                  'h-9 rounded-lg text-sm font-medium tap',
                  category === c ? 'bg-brand text-white' : 'bg-surface-hi text-text-muted'
                ].join(' ')}
              >
                {CAT_LABEL[c]}
              </button>
            ))}
          </div>
          {/* Le rôle dans la diète est déduit de la catégorie. « Autre » = aucun rôle :
              l'aliment reste loggable à la main mais n'entre pas dans le menu auto. */}
          {category === 'autre' ? (
            <p className="text-xs text-warn mt-2">
              ⚠ « Autre » : cet aliment restera loggable à la main, mais ne sera pas utilisé dans le menu auto ni compté
              dans une catégorie essentielle. Choisis un type (Protéine, Glucide, Lipide, Légume, Fruit) pour qu'il
              entre dans ta diète et puisse en remplacer un autre du même type.
            </p>
          ) : (
            <p className="text-xs text-text-muted mt-2">
              C'est la catégorie, pas le nom, qui détermine comment l'aliment est utilisé dans la diète (et par quoi il
              peut être remplacé).
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Kcal / 100g" value={kcal} onChange={setKcal} suffix="kcal" />
          <NumberInput label="Protéines"   value={p}    onChange={setP}    suffix="g" />
          <NumberInput label="Glucides"    value={g}    onChange={setG}    suffix="g" />
          <NumberInput label="Lipides"     value={l}    onChange={setL}    suffix="g" />
        </div>

        <div>
          <span className="block text-sm text-text-muted mb-1.5">État de référence des macros</span>
          <SegmentedControl<'raw' | 'cooked'>
            value={state}
            onChange={setState}
            options={[{ value: 'raw', label: 'Cru / sec' }, { value: 'cooked', label: 'Cuit' }]}
          />
        </div>

        <NumberInput
          label="Facteur cru→cuit (optionnel)"
          hint="Ex: riz blanc 2.5, viande 0.7"
          value={cookedFactor}
          onChange={setCookedFactor}
          step={0.1}
        />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-text-muted">Portions concrètes (optionnel)</span>
            <button
              type="button"
              onClick={() => setServings([...servings, { label: '', grams: 0 }])}
              className="text-brand text-xs font-semibold tap inline-flex items-center gap-1"
            >
              <Plus size={14} /> Ajouter
            </button>
          </div>
          <p className="text-xs text-text-muted mb-2">Ex : "1 œuf" = 50g. Ça aide à doser sans peser à chaque fois.</p>
          <div className="space-y-2">
            {servings.map((s, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <Input
                  placeholder="1 portion"
                  value={s.label}
                  onChange={(e) => {
                    const next = [...servings]; next[idx] = { ...next[idx], label: e.target.value }; setServings(next);
                  }}
                  className="flex-1"
                />
                <NumberInput
                  value={s.grams || ''}
                  onChange={(v) => {
                    const next = [...servings]; next[idx] = { ...next[idx], grams: typeof v === 'number' ? v : 0 }; setServings(next);
                  }}
                  suffix="g"
                  className="!w-24"
                />
                <button type="button" onClick={() => setServings(servings.filter((_, i) => i !== idx))} aria-label="Supprimer" className="h-12 px-2 tap">
                  <Trash2 size={16} className="text-danger" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-sm text-text-muted mb-1.5">Composition</span>
          <p className="text-xs text-text-muted mb-2">
            Ce que l'aliment contient. Indispensable si tu as posé un profil ou une
            allergie dans « Régime et allergies » : sans ça, l'app ne peut pas savoir
            qu'il faut l'écarter.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TAG_ORDER.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={[
                    'text-xs font-medium rounded-full px-3 py-1.5 tap',
                    on ? 'bg-danger text-white' : 'bg-surface-hi text-text-muted'
                  ].join(' ')}
                >
                  {TAG_LABEL[t]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-sm text-text-muted mb-1.5">Apports notables (optionnel)</span>
          <p className="text-xs text-text-muted mb-2">
            Coche ce dont cet aliment est une vraie source. Ça le fait compter dans le bilan
            « Ce que ta semaine couvre ». Ne coche que les sources franches : un marqueur de
            complaisance ferait passer une carence pour une couverture.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {NUTRIENT_ORDER.map((n) => {
              const on = nutrients.includes(n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNutrients(on ? nutrients.filter((x) => x !== n) : [...nutrients, n])}
                  className={[
                    'text-xs font-medium rounded-full px-3 py-1.5 tap',
                    on ? 'bg-brand text-white' : 'bg-surface-hi text-text-muted'
                  ].join(' ')}
                >
                  {NUTRIENT_META[n].label}
                </button>
              );
            })}
          </div>
        </div>

        <Button block onClick={save} disabled={!canSave}>Enregistrer</Button>

        {food && canDelete && (
          <Button block variant="danger" leadingIcon={<Trash2 size={16} />} onClick={remove}>
            Supprimer cet aliment
          </Button>
        )}
      </div>
    </Sheet>
  );
}
