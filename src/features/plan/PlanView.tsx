import { useState } from 'react';
import { getISODay } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { CollapsibleCard } from '@/components/ui';
import { useProfileStore } from '@/store/profileStore';
import { useFoodsStore } from '@/store/foodsStore';
import { MEAL_LABEL, MEAL_SLOTS } from '@/types';
import { WEEKDAY_LABEL, WEEKDAY_LABEL_LONG } from '@/lib/templates';
import { macrosForItem, sumMacros } from '@/lib/nutrition';
import { fmtG, fmtKcal, describeServing, rawEquivLabel } from '@/lib/format';
import { haptic } from '@/lib/haptic';

/**
 * Vue lecture-seule de la rotation hebdomadaire 7 jours.
 *  - L'utilisateur ne peut RIEN modifier ici : le plan est dicté.
 *  - Tabs Lun-Dim, défaut sur aujourd'hui.
 *  - Pour chaque jour : macros totales + détail des 4 repas.
 *
 * Si l'utilisateur veut ajuster ses cibles, c'est dans MacroTargetsForm (onglet Objectif).
 * Pour le plan lui-même, il n'a rien à toucher.
 */
export function PlanView() {
  const settings = useProfileStore((s) => s.settings);
  const byId = useFoodsStore((s) => s.byId);
  const [selected, setSelected] = useState<number>(() => getISODay(new Date()));

  if (!settings) return null;

  const tpl = settings.weeklyTemplates?.[String(selected)] ?? settings.planTemplate;

  // Macros du jour
  const dayTotals = sumMacros(
    tpl.flatMap((m) =>
      m.items.map((it) => macrosForItem(byId(it.foodId), { foodId: it.foodId, grams: it.grams, cooked: it.cooked }))
    )
  );

  return (
    <CollapsibleCard
      title="Ton plan de la semaine"
      icon={<CalendarDays size={18} />}
      summary="7 menus qui se répètent chaque semaine"
      defaultOpen
    >
      <p className="text-xs text-text-muted leading-snug">
        7 menus optimisés (oméga-3 ×2, fer héminique ×3, variété fruits/glucides). Pour les
        changer, modifie tes aliments ou tes repas dans l'onglet Aliments.
      </p>

      {/* Onglets des 7 jours */}
      <div className="grid grid-cols-7 gap-1">
        {[1,2,3,4,5,6,7].map((d) => {
          const active = selected === d;
          return (
            <button
              key={d}
              onClick={() => { if (!active) haptic('selection'); setSelected(d); }}
              className={[
                'h-10 rounded-lg text-xs font-semibold tap',
                active ? 'bg-brand text-white' : 'bg-surface-hi text-text-muted'
              ].join(' ')}
            >
              {WEEKDAY_LABEL[d]}
            </button>
          );
        })}
      </div>

      {/* Header du jour : nom + macros totales */}
      <div className="rounded-xl bg-surface-hi border border-border p-3">
        <div className="font-semibold capitalize">{WEEKDAY_LABEL_LONG[selected]}</div>
        <div className="text-xs text-text-muted mt-1">
          {fmtKcal(dayTotals.kcal)} · P {fmtG(dayTotals.protein)} · G {fmtG(dayTotals.carbs)} · L {fmtG(dayTotals.fat)}
        </div>
      </div>

      {/* Liste des repas */}
      {MEAL_SLOTS.map((slot) => {
        const meal = tpl.find((m) => m.slot === slot);
        if (!meal || meal.items.length === 0) return null;
        return (
          <div key={slot}>
            <div className="text-[11px] uppercase tracking-wide text-text-muted mb-1.5 px-1">
              {MEAL_LABEL[slot]}
            </div>
            <ul className="space-y-1.5">
              {meal.items.map((it, idx) => {
                const food = byId(it.foodId);
                const serving = food?.commonServings?.[0];
                const equiv = serving ? describeServing(it.grams, serving) : null;
                const rawEq = food ? rawEquivLabel(food, it.grams, it.cooked) : null;
                return (
                  <li key={idx} className="flex items-baseline justify-between gap-3 px-1">
                    <span className="text-sm min-w-0 leading-snug break-words">{food?.name ?? '–'}</span>
                    <span className="text-xs text-text-muted shrink-0 text-right">
                      {it.grams}g {it.cooked ? 'cuit' : ''}
                      {rawEq && <span className="block opacity-80">{rawEq}</span>}
                      {equiv && <span className="block opacity-80">≈ {equiv}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </CollapsibleCard>
  );
}
