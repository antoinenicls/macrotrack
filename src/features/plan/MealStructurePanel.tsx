import { CollapsibleCard, HelpHint } from '@/components/ui';
import { Check, Clock } from 'lucide-react';
import { MEAL_LABEL, MEAL_SLOTS, type MealSlot } from '@/types';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { MEAL_PRESETS, activeSlotsOf, matchingMealPreset } from '@/lib/mealStructure';
import { haptic } from '@/lib/haptic';

/**
 * « Repas de la journée » : combien de repas par jour, et lesquels.
 *
 * Désactiver un repas ne supprime pas ses aliments, il les reverse dans le repas actif le
 * plus proche. La journée garde donc exactement les mêmes calories et les mêmes macros.
 * C'est dit explicitement à l'écran : sauter le petit-déjeuner déplace des calories, ça
 * n'en enlève pas, et laisser croire l'inverse serait trompeur.
 */
export function MealStructurePanel() {
  const settings = useProfileStore((s) => s.settings);
  const setActiveSlots = useProfileStore((s) => s.setActiveSlots);
  const toast = useUIStore((s) => s.toast);

  if (!settings) return null;

  const active = activeSlotsOf(settings.activeSlots);
  const preset = matchingMealPreset(settings.activeSlots);

  const apply = async (slots: MealSlot[], label: string) => {
    if (slots.length === 0) {
      haptic('warning');
      toast('Garde au moins un repas dans ta journée', 'error');
      return;
    }
    haptic('selection');
    await setActiveSlots(slots);
    toast(label, 'success');
  };

  const toggle = (s: MealSlot) => {
    const next = active.includes(s) ? active.filter((x) => x !== s) : [...active, s];
    void apply(
      MEAL_SLOTS.filter((x) => next.includes(x)),
      active.includes(s) ? `${MEAL_LABEL[s]} retiré, ses aliments sont reversés` : `${MEAL_LABEL[s]} rétabli`
    );
  };

  const summary = `${preset ? preset.label : `${active.length} repas`} : ${active.map((s) => MEAL_LABEL[s].toLowerCase()).join(', ')}`;

  return (
    <CollapsibleCard title="Repas de la journée" icon={<Clock size={18} />} summary={summary}>
      <HelpHint>
        Retirer un repas ne retire pas ses aliments : ils sont reversés dans le repas actif
        le plus proche. Ta journée garde exactement les mêmes calories et les mêmes macros,
        elles sont juste réparties autrement. Sauter le petit-déjeuner ne fait pas maigrir
        plus vite, ça concentre les repas.
      </HelpHint>

      <div className="grid grid-cols-2 gap-1.5">
        {MEAL_PRESETS.map((p) => {
          const on = preset?.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => apply([...p.slots], `${p.label} appliqué`)}
              className={[
                'rounded-xl px-3 py-2.5 text-left tap border transition-colors',
                on ? 'bg-brand/10 border-brand/40' : 'bg-surface-hi border-transparent'
              ].join(' ')}
            >
              <span className={`block text-sm ${on ? 'font-semibold text-brand' : ''}`}>{p.label}</span>
              <span className="block text-[10px] text-text-muted mt-0.5 leading-tight">{p.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-1.5">
        {MEAL_SLOTS.map((s) => {
          const on = active.includes(s);
          return (
            <button
              key={s}
              onClick={() => toggle(s)}
              className={[
                'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 tap text-left border transition-colors',
                on ? 'bg-brand/10 border-brand/40' : 'bg-surface-hi border-transparent opacity-70'
              ].join(' ')}
            >
              <span
                className={[
                  'shrink-0 w-5 h-5 rounded-md flex items-center justify-center',
                  on ? 'bg-brand text-white' : 'border-2 border-border'
                ].join(' ')}
                aria-hidden
              >
                {on && <Check size={13} strokeWidth={3} />}
              </span>
              <span className={`flex-1 min-w-0 text-sm ${on ? '' : 'text-text-muted line-through'}`}>
                {MEAL_LABEL[s]}
              </span>
            </button>
          );
        })}
      </div>

      <HelpHint>
        Avec moins de repas, les portions deviennent forcément plus copieuses. Si un repas
        te paraît trop gros, remets-en un : c'est le même total réparti autrement.
      </HelpHint>
    </CollapsibleCard>
  );
}
