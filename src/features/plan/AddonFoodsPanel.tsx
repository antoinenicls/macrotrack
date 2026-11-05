import { CollapsibleCard, HelpHint } from '@/components/ui';
import { Utensils } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useUIStore } from '@/store/uiStore';
import { MEAL_LABEL } from '@/types';
import { haptic } from '@/lib/haptic';

/**
 * Ingrédients d'APPOINT : aliments occasionnels (crème de riz pré-training…) qu'on active
 * quand on en a et qu'on désactive sinon, via un interrupteur « j'en ai / j'en ai pas ».
 * Disponible → injecté dans son créneau et le plan se re-échelonne pour tenir la cible ;
 * indisponible → retiré du plan (rien à cocher), les autres aliments absorbent ses calories.
 * Cf. lib/addons / AddonFood.
 */
export function AddonFoodsPanel() {
  const settings = useProfileStore((s) => s.settings);
  const setAddonAvailable = useProfileStore((s) => s.setAddonAvailable);
  const setAddonVariant = useProfileStore((s) => s.setAddonVariant);
  const byId = useFoodsStore((s) => s.byId);
  const toast = useUIStore((s) => s.toast);

  const addons = settings?.addonFoods ?? [];
  if (addons.length === 0) return null;

  const toggle = async (addonId: string, next: boolean, name: string) => {
    haptic(next ? 'selection' : 'light');
    await setAddonAvailable(addonId, next);
    toast(next ? `${name} : ajouté à ta diète` : `${name} : retiré`, 'success');
  };

  const pickVariant = async (addonId: string, foodId: string, label: string) => {
    haptic('selection');
    await setAddonVariant(addonId, foodId);
    toast(`Parfum : ${label}`, 'success');
  };

  return (
    <CollapsibleCard
      title="Ingrédients d'appoint"
      icon={<Utensils size={18} />}
      summary={(() => {
        const on = addons.filter((a) => a.available).length;
        return on === 0 ? 'Aucun en ce moment' : `${on} sur ${addons.length} dans ton plan`;
      })()}
    >
      <div className="space-y-2">
        {addons.map((a) => {
          const food = byId(a.foodId);
          const name = food?.name ?? a.foodId;
          const on = a.available;
          const variants = a.variants ?? [];
          return (
            <div key={a.id}>
              <button
                onClick={() => toggle(a.id, !on, name)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-hi tap active:bg-surface text-left"
              >
                <div className="flex items-center gap-3 flex-1 pr-3 min-w-0">
                  <span className="shrink-0 rounded-xl bg-brand/15 text-brand p-2">
                    <Utensils size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-snug break-words">{name}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {MEAL_LABEL[a.slot]}
                      {on
                        ? ' · dans ton plan, le reste s’ajuste à ta cible'
                        : ' · j’en ai pas en ce moment'}
                    </div>
                  </div>
                </div>
                <span
                  className={[
                    'shrink-0 w-11 h-6 rounded-full relative transition-colors',
                    on ? 'bg-brand' : 'bg-border'
                  ].join(' ')}
                  aria-hidden
                >
                  <span
                    className={[
                      'absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all',
                      on ? 'left-[22px]' : 'left-0.5'
                    ].join(' ')}
                  />
                </span>
              </button>

              {/* Choix du parfum / de la référence : une seule variante à la fois. */}
              {variants.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
                  {variants.map((v) => {
                    const active = v.foodId === a.foodId;
                    return (
                      <button
                        key={v.foodId}
                        onClick={() => pickVariant(a.id, v.foodId, v.label)}
                        aria-pressed={active}
                        className={[
                          'h-8 px-3 rounded-full text-xs font-semibold tap transition-colors',
                          active
                            ? 'bg-brand text-white'
                            : 'bg-surface-hi text-text-muted border border-border active:bg-surface'
                        ].join(' ')}
                      >
                        {v.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <HelpHint>
        Active « j'en ai » les jours où tu as l'ingrédient : il rejoint ta diète et le reste
        des portions s'ajuste pour tenir ta cible. Désactive-le sinon : ta diète reste
        complète et cochable sans lui.
      </HelpHint>
    </CollapsibleCard>
  );
}
