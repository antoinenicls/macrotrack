import { useState } from 'react';
import { Card, Button, NumberInput, HelpHint } from '@/components/ui';
import { Plus, Trash2, Sparkles, RotateCcw } from 'lucide-react';
import { getISODay } from 'date-fns';
import { useProfileStore } from '@/store/profileStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useUIStore } from '@/store/uiStore';
import { MEAL_LABEL, MEAL_SLOTS, type Food, type MealSlot, type PlanTemplateMeal } from '@/types';
import { FoodSearchSheet } from '@/features/nutrition/FoodSearchSheet';
import { macrosForItem, sumMacros } from '@/lib/nutrition';
import { fmtG, fmtKcal } from '@/lib/format';
import { WEEKDAY_LABEL, WEEKDAY_LABEL_LONG, hasCustomTemplateForWeekday } from '@/lib/templates';
import { SEED_WEEKLY_ROTATION } from '@/data/seedWeeklyRotation';

/**
 * Editeur du plan type.
 *  - "Commun" (slot=0)   → settings.planTemplate (fallback pour tous les jours)
 *  - Lun..Dim (slot=1-7) → settings.weeklyTemplates[weekday] (override par jour)
 *
 * Bouton "Charger la rotation optimisée" → remplit les 7 jours avec une rotation
 * anti-carence pré-conçue (voir seedWeeklyRotation.ts).
 */
export function TemplateDayForm() {
  const settings = useProfileStore((s) => s.settings);
  const saveCommon = useProfileStore((s) => s.savePlanTemplate);
  const saveWeekday = useProfileStore((s) => s.saveWeekdayTemplate);
  const clearWeekday = useProfileStore((s) => s.clearWeekdayTemplate);
  const saveAllWeekly = useProfileStore((s) => s.saveAllWeeklyTemplates);
  const byId = useFoodsStore((s) => s.byId);
  const toast = useUIStore((s) => s.toast);

  // 0 = Commun, 1..7 = Lun..Dim. Défaut : aujourd'hui.
  const [selected, setSelected] = useState<number>(() => getISODay(new Date()));
  const [picker, setPicker] = useState<MealSlot | null>(null);

  if (!settings) return null;

  const isCommon = selected === 0;
  const hasWeekdayTpl = !isCommon && hasCustomTemplateForWeekday(selected, settings);

  // Template effectivement édité — calcul inline (pas de useMemo car après early return)
  const effectiveTpl: PlanTemplateMeal[] = isCommon
    ? settings.planTemplate
    : (settings.weeklyTemplates?.[String(selected)] ?? settings.planTemplate);

  const getMeal = (slot: MealSlot): PlanTemplateMeal =>
    effectiveTpl.find((m) => m.slot === slot) ?? { slot, items: [] };

  /** Persiste les changements vers le bon emplacement (commun OU jour). */
  const persist = async (next: PlanTemplateMeal[]) => {
    if (isCommon) await saveCommon(next);
    else await saveWeekday(selected, next);
  };

  const updateMeal = async (slot: MealSlot, m: PlanTemplateMeal) => {
    const without = effectiveTpl.filter((x) => x.slot !== slot);
    await persist([...without, m]);
  };

  const addItem = async (slot: MealSlot, food: Food) => {
    const m = getMeal(slot);
    await updateMeal(slot, { ...m, items: [...m.items, { foodId: food.id, grams: 100, cooked: false }] });
    setPicker(null);
  };

  const removeItem = async (slot: MealSlot, idx: number) => {
    const m = getMeal(slot);
    await updateMeal(slot, { ...m, items: m.items.filter((_, i) => i !== idx) });
  };

  const loadOptimizedRotation = async () => {
    if (!confirm("Cela va remplacer les 7 plans hebdomadaires par la rotation optimisée anti-carence. Continuer ?")) return;
    await saveAllWeekly(SEED_WEEKLY_ROTATION);
    toast('Rotation hebdomadaire chargée 🎯', 'success');
    setSelected(getISODay(new Date()));
  };

  const resetWeekday = async () => {
    if (!confirm(`Supprimer le plan spécifique pour ${WEEKDAY_LABEL_LONG[selected]} ? Ce jour utilisera le plan commun à la place.`)) return;
    await clearWeekday(selected);
    toast('Plan du jour supprimé', 'success');
  };

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-semibold">Plan type</h3>
        <HelpHint>
          Le menu que tu suis chaque jour. Une rotation hebdomadaire (Lun-Dim) est pré-chargée pour varier la semaine. Cette semaine se répète à l'identique chaque semaine.
        </HelpHint>
      </div>

      {/* Sélecteur de jour */}
      <div>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            onClick={() => setSelected(0)}
            className={[
              'h-10 rounded-lg text-xs font-semibold tap col-span-1',
              isCommon ? 'bg-brand text-white' : 'bg-surface-hi text-text-muted'
            ].join(' ')}
          >
            Commun
          </button>
          {[1,2,3,4,5,6,7].map((d) => {
            const active = selected === d;
            const customized = hasCustomTemplateForWeekday(d, settings);
            return (
              <button
                key={d}
                onClick={() => setSelected(d)}
                className={[
                  'h-10 rounded-lg text-xs font-semibold tap relative',
                  active ? 'bg-brand text-white' : 'bg-surface-hi text-text-muted'
                ].join(' ')}
              >
                {WEEKDAY_LABEL[d]}
                {customized && !active && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-brand" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bannière contextuelle */}
      {!isCommon && !hasWeekdayTpl && (
        <div className="rounded-xl bg-brand/10 border border-brand/30 p-3 text-xs">
          <span className="text-text-muted">
            {WEEKDAY_LABEL_LONG[selected]} utilise actuellement le <strong className="text-text">plan commun</strong>.
            Toute modification créera un plan spécifique pour ce jour.
          </span>
        </div>
      )}
      {!isCommon && hasWeekdayTpl && (
        <div className="flex items-center justify-between rounded-xl bg-success/10 border border-success/30 p-3 text-xs">
          <span className="text-text-muted">
            Plan spécifique actif pour <strong className="text-text">{WEEKDAY_LABEL_LONG[selected]}</strong>.
          </span>
          <button onClick={resetWeekday} className="text-danger font-semibold inline-flex items-center gap-1">
            <RotateCcw size={12} /> Réinit.
          </button>
        </div>
      )}

      {/* Bouton charger rotation pré-conçue */}
      <button
        onClick={loadOptimizedRotation}
        className="w-full flex items-center gap-3 bg-brand/10 border border-brand/30 rounded-2xl p-3 tap active:bg-brand/20"
      >
        <div className="rounded-xl bg-brand/20 text-brand p-2">
          <Sparkles size={18} />
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-sm">Charger la rotation hebdomadaire optimisée</div>
          <div className="text-xs text-text-muted">7 jours équilibrés : oméga-3 ×2, fer héminique ×3, variété glucides/fruits</div>
        </div>
      </button>

      {/* Repas du template sélectionné */}
      {MEAL_SLOTS.map((slot) => {
        const m = getMeal(slot);
        const totals = sumMacros(m.items.map((it) => macrosForItem(byId(it.foodId), { foodId: it.foodId, grams: it.grams, cooked: it.cooked })));
        return (
          <div key={slot} className="rounded-xl bg-surface-hi border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="font-medium">{MEAL_LABEL[slot]}</div>
                <div className="text-xs text-text-muted">
                  {fmtKcal(totals.kcal)} • P {fmtG(totals.protein)} G {fmtG(totals.carbs)} L {fmtG(totals.fat)}
                </div>
              </div>
              <Button size="sm" variant="ghost" leadingIcon={<Plus size={14} />} onClick={() => setPicker(slot)}>Aliment</Button>
            </div>

            <ul className="space-y-2">
              {m.items.map((it, idx) => {
                const food = byId(it.foodId);
                const canToggle = !!food?.cookedFactor;
                return (
                  <li key={idx} className="flex items-center gap-2 bg-surface rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm leading-snug break-words">{food?.name ?? '–'}</div>
                      {canToggle && (
                        <button
                          type="button"
                          onClick={async () => {
                            const isNativeCooked = food!.state === 'cooked';
                            const factor = food!.cookedFactor!;
                            const newCooked = !it.cooked;
                            const wasNative = it.cooked === isNativeCooked;
                            const nativeGrams = wasNative ? it.grams : (it.cooked ? it.grams / factor : it.grams * factor);
                            const newGrams = newCooked === isNativeCooked
                              ? nativeGrams
                              : newCooked ? nativeGrams * factor : nativeGrams / factor;
                            const items = [...m.items];
                            items[idx] = { ...items[idx], cooked: newCooked, grams: Math.round(newGrams) };
                            await updateMeal(slot, { ...m, items });
                          }}
                          className="text-[10px] uppercase tracking-wide mt-0.5 px-1.5 py-0.5 rounded bg-surface-hi text-text-muted tap"
                        >
                          {it.cooked ? 'Cuit' : 'Cru/sec'} ↻
                        </button>
                      )}
                    </div>
                    <NumberInput
                      value={it.grams}
                      onChange={async (v) => {
                        const items = [...m.items];
                        items[idx] = { ...items[idx], grams: typeof v === 'number' ? v : 0 };
                        await updateMeal(slot, { ...m, items });
                      }}
                      suffix="g"
                      className="!h-9 !w-24"
                    />
                    <button onClick={() => removeItem(slot, idx)} aria-label="Supprimer" className="tap">
                      <Trash2 size={16} className="text-danger" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <FoodSearchSheet open={picker !== null} onClose={() => setPicker(null)} onPick={(f) => picker && addItem(picker, f)} />
    </Card>
  );
}
