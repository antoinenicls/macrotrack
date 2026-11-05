import { useMemo, useState } from 'react';
import { Sheet, Button } from '@/components/ui';
import { Check, RotateCcw, Plus } from 'lucide-react';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { usableFoodIds, isExcluded } from '@/lib/diet';
import { swapCandidates, type SwapCandidate } from '@/lib/swap';
import { haptic } from '@/lib/haptic';
import type { Food, MealSlot } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Aliment du plan à remplacer, avec sa portion prévue. */
  target: { food: Food; grams: number; cooked: boolean; slot: MealSlot } | null;
  /** Date concernée par un remplacement ponctuel. */
  dateKey: string;
}

/**
 * « Pas envie de ça » : remplace un aliment du menu par un autre du même rôle, avec le
 * grammage équivalent déjà calculé.
 *
 * Deux portées, parce que les deux besoins existent et n'ont pas la même conséquence :
 *  - juste aujourd'hui : n'écrit que le plan figé du jour, le menu d'origine revient demain ;
 *  - toujours : remplacement durable, réappliqué à chaque reconstruction du plan.
 * Un aliment choisi hors sélection entre dans la diète (on ne peut pas mettre au menu un
 * aliment qu'on refuse par ailleurs).
 */
export function SwapSheet({ open, onClose, target, dateKey }: Props) {
  const foods = useFoodsStore((s) => s.foods);
  const settings = useProfileStore((s) => s.settings);
  const setFoodSwap = useProfileStore((s) => s.setFoodSwap);
  const clearFoodSwap = useProfileStore((s) => s.clearFoodSwap);
  const swapForDay = useProfileStore((s) => s.swapForDay);
  const toast = useUIStore((s) => s.toast);

  const [picked, setPicked] = useState<SwapCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  const allowed = useMemo(
    () => usableFoodIds(settings?.selectedFoodIds, settings?.excludedTags, foods),
    [settings?.selectedFoodIds, settings?.excludedTags, foods]
  );

  // Un aliment exclu (allergie, profil) n'est même pas PROPOSÉ : le montrer barré
  // reviendrait à suggérer de le manger.
  const choosable = useMemo(
    () => foods.filter((f) => !isExcluded(f, settings?.excludedTags)),
    [foods, settings?.excludedTags]
  );

  const candidates = useMemo(
    () => (target ? swapCandidates(target.food, target.grams, target.cooked, choosable, allowed) : []),
    [target, choosable, allowed]
  );

  /** Remplacement durable dont CET aliment est déjà la cible → on peut revenir en arrière. */
  const originId = useMemo(() => {
    if (!target || !settings?.foodSwaps) return null;
    return Object.entries(settings.foodSwaps).find(([, to]) => to === target.food.id)?.[0] ?? null;
  }, [target, settings?.foodSwaps]);
  const originFood = originId ? foods.find((f) => f.id === originId) : undefined;

  if (!target) return null;

  const close = () => { setPicked(null); onClose(); };

  const applyToday = async () => {
    if (!picked || busy) return;
    setBusy(true);
    haptic('success');
    await swapForDay(dateKey, target.slot, target.food.id, picked.food);
    toast(`${picked.food.name} pour aujourd'hui`, 'success');
    setBusy(false);
    close();
  };

  const applyAlways = async () => {
    if (!picked || busy) return;
    setBusy(true);
    haptic('success');
    await setFoodSwap(target.food.id, picked.food.id);
    toast(`${target.food.name} remplacé par ${picked.food.name}`, 'success');
    setBusy(false);
    close();
  };

  const revert = async () => {
    if (!originId || busy) return;
    setBusy(true);
    haptic('selection');
    await clearFoodSwap(originId);
    toast(`Retour à ${originFood?.name ?? "l'aliment d'origine"}`, 'success');
    setBusy(false);
    close();
  };

  return (
    <Sheet open={open} onClose={close} title={`Remplacer ${target.food.name}`}>
      <div className="space-y-4">
        <p className="text-xs text-text-muted">
          Portion prévue : <span className="font-semibold text-text">{target.grams} g{target.cooked ? ' cuit' : ''}</span>.
          Les quantités proposées apportent des macros équivalentes, ta journée reste sur
          sa cible.
        </p>

        {originFood && (
          <button
            onClick={revert}
            disabled={busy}
            className="w-full flex items-center gap-2.5 rounded-2xl border border-border bg-surface-hi px-3 py-2.5 tap active:bg-surface text-left"
          >
            <RotateCcw size={16} className="text-text-muted shrink-0" />
            <span className="flex-1 min-w-0 text-sm">
              Revenir à <span className="font-semibold">{originFood.name}</span>
              <span className="block text-[11px] text-text-muted">Annule le remplacement permanent</span>
            </span>
          </button>
        )}

        {candidates.length === 0 ? (
          <p className="text-sm text-text-muted py-2">
            Aucune alternative du même type dans ta base. Ajoute un aliment depuis
            « Plan → Aliments → Mes aliments » pour pouvoir échanger celui-ci.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-[45vh] overflow-y-auto">
            {candidates.map((c) => {
              const on = picked?.food.id === c.food.id;
              return (
                <button
                  key={c.food.id}
                  onClick={() => { haptic('selection'); setPicked(c); }}
                  className={[
                    'w-full flex items-center gap-2.5 rounded-2xl px-3 py-2.5 tap text-left border transition-colors',
                    on ? 'bg-brand/10 border-brand/40' : 'bg-surface-hi border-transparent'
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
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm leading-snug break-words">{c.food.name}</span>
                    {!c.allowed && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-text-muted mt-0.5">
                        <Plus size={9} /> sera ajouté à ta diète
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    {/* Aliment qui se mange par pièces : le compte passe devant les grammes. */}
                    {c.pieces ? (
                      <>
                        <span className="block text-xs font-semibold text-text">{c.pieces}</span>
                        <span className="block text-[10px] text-text-muted tabular-nums">{c.grams} g</span>
                      </>
                    ) : (
                      <span className="block text-xs font-semibold tabular-nums text-text-muted">
                        {c.grams} g{c.cooked ? ' cuit' : ''}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {picked && (
          <div className="space-y-2">
            <Button block onClick={applyToday} disabled={busy}>
              Juste aujourd'hui
            </Button>
            <Button block variant="secondary" onClick={applyAlways} disabled={busy}>
              Toujours, dans toute ma rotation
            </Button>
            <p className="text-[11px] text-text-muted">
              « Toujours » remplace cet aliment partout dans ta semaine et survit aux
              recalculs du coach. Tu pourras revenir en arrière depuis ce même écran.
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
