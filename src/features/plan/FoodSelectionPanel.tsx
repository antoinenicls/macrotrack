import { useMemo, useState } from 'react';
import { CollapsibleCard, HelpHint } from '@/components/ui';
import { Check, Lock, Plus, Pencil, Ban, Apple } from 'lucide-react';
import type { Food, FoodCategory } from '@/types';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { FoodForm } from '@/features/foods/FoodForm';
import { SEED_FOODS } from '@/data/seedFoods';
import {
  foodRole, type FoodRole, ROLE_LABEL, BASE_FOOD_IDS, ESSENTIAL_ROLES,
  missingEssentialRoles
} from '@/lib/foodSelection';
import { excludedReasons, isExcluded, usableFoodIds, TAG_LABEL } from '@/lib/diet';
import { haptic } from '@/lib/haptic';

/** Ordre d'affichage des rôles. */
const ROLE_ORDER: FoodRole[] = ['protein', 'carb', 'legume', 'veg', 'fruit', 'fat', 'other'];
const BASE_SET = new Set(BASE_FOOD_IDS);
/** Aliments du seed : modifiables, mais NON supprimables (la rotation s'appuie dessus). */
const SEED_IDS = new Set(SEED_FOODS.map((f) => f.id));
/** Catégorie pré-remplie quand on ajoute un aliment depuis un groupe. */
const ROLE_TO_CATEGORY: Record<FoodRole, FoodCategory> = {
  protein: 'proteine',
  carb: 'glucide',
  legume: 'glucide',
  veg: 'legume',
  fruit: 'fruit',
  fat: 'lipide',
  other: 'autre'
};

/**
 * « Mes aliments » : l'utilisateur choisit les aliments que sa diète a le droit
 * d'utiliser. Tout aliment de la rotation hors sélection est remplacé par un autorisé du
 * même rôle (cf. lib/foodSelection). La base recommandée est pré-cochée (badge) mais
 * remplaçable ; on empêche seulement de VIDER un rôle essentiel (sinon la diète ne peut
 * plus se composer).
 */
export function FoodSelectionPanel() {
  const foods = useFoodsStore((s) => s.foods);
  const byId = useFoodsStore((s) => s.byId);
  const settings = useProfileStore((s) => s.settings);
  const setSelectedFoods = useProfileStore((s) => s.setSelectedFoods);
  const rebuildPlan = useProfileStore((s) => s.rebuildPlan);
  const toast = useUIStore((s) => s.toast);

  // Édition/création d'aliment (Sheet FoodForm).
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Food | null>(null);
  const [preset, setPreset] = useState<FoodCategory | undefined>(undefined);

  const allIds = useMemo(() => foods.map((f) => f.id), [foods]);
  // Sélection effective : absente → tout coché (comportement historique).
  const selected = useMemo(
    () => new Set(settings?.selectedFoodIds ?? allIds),
    [settings?.selectedFoodIds, allIds]
  );

  const groups = useMemo(() => {
    const map = new Map<FoodRole, Food[]>();
    for (const f of foods) {
      const r = foodRole(f);
      const arr = map.get(r);
      if (arr) arr.push(f);
      else map.set(r, [f]);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name));
    return ROLE_ORDER.filter((r) => map.has(r)).map((r) => [r, map.get(r)!] as const);
  }, [foods]);

  if (!settings) return null;

  // Couverture calculée sur les aliments RÉELLEMENT utilisables : un aliment coché mais
  // exclu par une allergie ne couvre pas son rôle.
  const usable = usableFoodIds(settings.selectedFoodIds, settings.excludedTags, foods);
  const missing = missingEssentialRoles(usable, byId);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) {
      const role = foodRole(byId(id) ?? { id, category: 'autre' });
      next.delete(id);
      // Garde : ne jamais vider un rôle ESSENTIEL (la diète ne pourrait plus se composer).
      if (ESSENTIAL_ROLES.includes(role) && missingEssentialRoles(next, byId).includes(role)) {
        haptic('warning');
        toast(`Garde au moins un aliment dans « ${ROLE_LABEL[role]} »`, 'error');
        return;
      }
      haptic('light');
    } else {
      next.add(id);
      haptic('selection');
    }
    void setSelectedFoods([...next]);
  };

  const resetToBase = () => {
    haptic('selection');
    void setSelectedFoods([...BASE_FOOD_IDS]);
    toast('Diète repartie sur la base recommandée', 'success');
  };

  const openAdd = (role: FoodRole) => {
    haptic('selection');
    setEditing(null);
    setPreset(ROLE_TO_CATEGORY[role]);
    setFormOpen(true);
  };

  const openEdit = (f: Food) => {
    haptic('light');
    setEditing(f);
    setPreset(undefined);
    setFormOpen(true);
  };

  /**
   * Après création/édition : si la sélection est explicite, on s'assure que l'aliment en
   * fait partie (on vient de le créer → on veut le manger). Sinon (sélection implicite =
   * tout autorisé) on se contente de reconstruire le plan pour refléter les macros.
   */
  const onSaved = (f: Food) => {
    const sel = settings.selectedFoodIds;
    if (sel && !sel.includes(f.id)) void setSelectedFoods([...sel, f.id]);
    else void rebuildPlan();
  };

  const onDeleted = (id: string) => {
    const sel = settings.selectedFoodIds;
    if (sel?.includes(id)) void setSelectedFoods(sel.filter((x) => x !== id));
    else void rebuildPlan();
  };

  return (
    <CollapsibleCard
      title="Mes aliments"
      icon={<Apple size={18} />}
      summary={`${usable.size} aliment${usable.size > 1 ? 's' : ''} au menu sur ${foods.length}`}
      headerRight={missing.length > 0 ? (
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-warn bg-warn/10 rounded-full px-2 py-0.5">
          À compléter
        </span>
      ) : undefined}
    >
      <HelpHint>
        Coche les aliments que tu acceptes de manger : ta diète ne composera ses repas
        qu'avec ceux-là. Les aliments <span className="font-semibold">« Base »</span> sont
        recommandés (socle simple et équilibré) mais tu peux les remplacer par une
        alternative du même type, tant qu'il reste au moins un aliment par catégorie
        essentielle. Tu peux aussi <span className="font-semibold">ajouter, modifier ou
        supprimer</span> tes propres aliments dans chaque catégorie.
      </HelpHint>

      {missing.length > 0 && (
        <div className="rounded-xl bg-warn/10 border border-warn/30 px-3 py-2.5 text-xs text-warn">
          ⚠ Il manque au moins un aliment dans : {missing.map((r) => ROLE_LABEL[r]).join(', ')}.
          Ta diète ne peut pas se composer correctement sans ça.
        </div>
      )}

      <div className="space-y-4">
        {groups.map(([role, list]) => {
          const nSel = list.filter((f) => usable.has(f.id)).length;
          const nUsable = list.filter((f) => !isExcluded(f, settings.excludedTags)).length;
          const essential = ESSENTIAL_ROLES.includes(role);
          return (
            <div key={role}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-text-muted">
                  {ROLE_LABEL[role]}{essential && <span className="text-brand"> · essentiel</span>}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-text-muted tabular-nums">{nSel}/{nUsable}</span>
                  <button
                    onClick={() => openAdd(role)}
                    className="text-brand text-xs font-semibold tap inline-flex items-center gap-1"
                  >
                    <Plus size={14} /> Ajouter
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                {list.map((f) => {
                  // Un aliment exclu (profil, allergie) n'est pas sélectionnable : on le
                  // laisse VISIBLE et barré plutôt que de le masquer, pour que l'absence
                  // soit explicable et qu'on comprenne quoi lever pour le récupérer.
                  const reasons = excludedReasons(f, settings.excludedTags);
                  const banned = reasons.length > 0;
                  const on = !banned && selected.has(f.id);
                  const isBase = BASE_SET.has(f.id);
                  return (
                    <div
                      key={f.id}
                      className={[
                        'flex items-center gap-2 pr-1 rounded-xl transition-colors',
                        banned ? 'bg-surface-hi border border-transparent opacity-60'
                          : on ? 'bg-brand/10 border border-brand/40' : 'bg-surface-hi border border-transparent'
                      ].join(' ')}
                    >
                      <button
                        onClick={() => banned ? toast(`Exclu : ${reasons.map((r) => TAG_LABEL[r]).join(', ')}`, 'error') : toggle(f.id)}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2.5 tap text-left"
                      >
                        <span
                          className={[
                            'shrink-0 w-5 h-5 rounded-md flex items-center justify-center',
                            on ? 'bg-brand text-white' : banned ? '' : 'border-2 border-border'
                          ].join(' ')}
                          aria-hidden
                        >
                          {on && <Check size={13} strokeWidth={3} />}
                          {banned && <Ban size={12} strokeWidth={3} className="text-text-muted" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm leading-snug break-words ${banned ? 'line-through text-text-muted' : ''}`}>{f.name}</span>
                          <span className="block text-[10px] text-text-muted">
                            {banned
                              ? reasons.map((r) => TAG_LABEL[r]).join(' · ')
                              : `${f.kcalPer100g} kcal · P ${f.proteinPer100g} · G ${f.carbsPer100g} · L ${f.fatPer100g} /100g`}
                          </span>
                        </span>
                        {!banned && isBase && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand bg-brand/10 rounded-full px-2 py-0.5">
                            <Lock size={10} /> Base
                          </span>
                        )}
                      </button>
                      <button
                        onClick={() => openEdit(f)}
                        aria-label={`Modifier ${f.name}`}
                        className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg tap active:bg-surface"
                      >
                        <Pencil size={15} className="text-text-muted" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={resetToBase}
        className="w-full px-3 py-2.5 rounded-xl bg-surface-hi tap active:bg-surface text-sm font-semibold text-text-muted"
      >
        Repartir de la base recommandée
      </button>

      <HelpHint>
        Le plan de la semaine se reconstruit tout seul avec tes aliments (les portions se
        recalibrent sur tes calories). Le changement s'applique dès demain : une journée
        déjà entamée n'est jamais réécrite. Les aliments de la base d'origine sont
        modifiables mais pas supprimables (le plan s'appuie dessus) ; ceux que tu ajoutes
        le sont.
      </HelpHint>

      <FoodForm
        open={formOpen}
        food={editing}
        presetCategory={preset}
        canDelete={!!editing && !SEED_IDS.has(editing.id)}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onClose={() => setFormOpen(false)}
      />
    </CollapsibleCard>
  );
}
