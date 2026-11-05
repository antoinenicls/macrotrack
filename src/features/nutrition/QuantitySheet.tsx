import { useEffect, useMemo, useState } from 'react';
import { Sheet, Button, NumberInput, SegmentedControl } from '@/components/ui';
import type { Food } from '@/types';
import { macrosForItem } from '@/lib/nutrition';
import { fmtG, fmtKcal } from '@/lib/format';
import { haptic } from '@/lib/haptic';
import { useProfileStore } from '@/store/profileStore';
import { Info } from 'lucide-react';

interface Props {
  open: boolean;
  food: Food | null;
  initialGrams?: number;
  initialCooked?: boolean;
  onClose: () => void;
  onConfirm: (grams: number, cooked: boolean) => void;
}

/**
 * Saisie de la quantité d'un aliment.
 *
 * Meal-prep aware :
 *  - Si l'aliment a un cookedFactor, on affiche un toggle "Cru/sec | Cuit" en évidence.
 *  - Le défaut vient de settings.foodPrefs[foodId].inputState (auto-appris).
 *  - Quand l'utilisateur change le toggle, on persiste la préférence pour ne pas
 *    avoir à re-basculer la prochaine fois.
 *  - Les "portions rapides" se convertissent automatiquement dans l'état affiché
 *    (ex: 1 portion riz = 80g sec OU 200g cuit).
 *  - L'aperçu affiche l'équivalent inverse ("250g cuit ≈ 100g cru équivalent").
 */
export function QuantitySheet({ open, food, initialGrams = 100, initialCooked, onClose, onConfirm }: Props) {
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);

  const [grams, setGrams] = useState<number | ''>(initialGrams);
  const [cooked, setCooked] = useState<boolean>(initialCooked ?? false);

  useEffect(() => {
    if (open && food) {
      setGrams(initialGrams);
      if (initialCooked != null) {
        setCooked(initialCooked);
      } else {
        // Défaut : préférence sauvegardée → sinon état natif des macros
        const pref = settings?.foodPrefs?.[food.id]?.inputState;
        setCooked(pref ? pref === 'cooked' : food.state === 'cooked');
      }
    }
  }, [open, food, initialGrams, initialCooked, settings]);

  // Persiste la préférence quand l'utilisateur change le toggle
  // (uniquement pour les aliments où le toggle a du sens = cookedFactor présent)
  const persistPref = async (next: boolean) => {
    if (!food || !settings || !food.cookedFactor) return;
    const wantedState: 'raw' | 'cooked' = next ? 'cooked' : 'raw';
    const current = settings.foodPrefs?.[food.id]?.inputState;
    if (current === wantedState) return;
    await saveSettings({
      ...settings,
      foodPrefs: {
        ...settings.foodPrefs,
        [food.id]: { ...settings.foodPrefs?.[food.id], inputState: wantedState }
      }
    });
  };

  if (!food) return <Sheet open={open} onClose={onClose}><div /></Sheet>;

  const hasCookedFactor = food.cookedFactor != null;

  // Convertit une quantité native → quantité dans l'état affiché (raw OU cooked)
  // Sert pour : portions rapides + équivalent inverse
  const toDisplayState = (nativeGrams: number, targetCooked: boolean): number => {
    if (!food.cookedFactor) return nativeGrams;
    const isNativeCooked = food.state === 'cooked';
    if (targetCooked === isNativeCooked) return nativeGrams;
    return targetCooked ? nativeGrams * food.cookedFactor : nativeGrams / food.cookedFactor;
  };

  // Portions rapides (chips) — calculées dans l'état affiché actuel
  const chips = useMemo(() => {
    const servings = food.commonServings ?? [];
    const first = servings[0];
    const result: Array<{ label: string; grams: number }> = [];
    if (first) {
      // 1×, 2×, 3×, 4× de la 1ère portion
      for (const n of [1, 2, 3, 4]) {
        const baseLabel = n === 1 ? first.label : `${n}× ${first.label.replace(/^1\s*/, '')}`;
        const g = Math.round(toDisplayState(first.grams * n, cooked));
        result.push({ label: baseLabel, grams: g });
      }
    }
    // Portions alternatives (déjà avec leur propre label)
    for (const s of servings.slice(1)) {
      result.push({ label: s.label, grams: Math.round(toDisplayState(s.grams, cooked)) });
    }
    return result;
  }, [food, cooked]);

  // Équivalent inverse pour l'aperçu : si on entre en cuit, on affiche l'équivalent cru, et vice-versa
  const inverseEquiv = useMemo(() => {
    if (!hasCookedFactor || typeof grams !== 'number' || grams <= 0) return null;
    const isNativeCooked = food.state === 'cooked';
    if (cooked === isNativeCooked) {
      // L'utilisateur saisit dans l'état natif → l'équivalent inverse est l'autre état
      const factor = food.cookedFactor!;
      const other = isNativeCooked ? grams / factor : grams * factor;
      return { grams: Math.round(other), state: isNativeCooked ? 'cru/sec' : 'cuit' };
    } else {
      // Saisi dans l'état non natif → équivalent dans l'état natif (= ce que la DB stocke)
      const factor = food.cookedFactor!;
      const native = cooked ? grams / factor : grams * factor;
      return { grams: Math.round(native), state: isNativeCooked ? 'cuit' : 'cru/sec' };
    }
  }, [grams, cooked, food, hasCookedFactor]);

  const preview = macrosForItem(food, { foodId: food.id, grams: typeof grams === 'number' ? grams : 0, cooked });

  return (
    <Sheet open={open} onClose={onClose} title={food.name}>
      <div className="space-y-4">

        {/* Toggle Cru/Cuit en haut, mis en évidence pour les aliments meal-prep */}
        {hasCookedFactor && (
          <div>
            <span className="block text-sm text-text-muted mb-1.5">État pesé</span>
            <SegmentedControl<'raw' | 'cooked'>
              value={cooked ? 'cooked' : 'raw'}
              onChange={(v) => {
                const next = v === 'cooked';
                setCooked(next);
                persistPref(next);
              }}
              options={[
                { value: 'raw',    label: 'Cru / sec' },
                { value: 'cooked', label: 'Cuit' }
              ]}
            />
            <p className="text-xs text-text-muted mt-1.5 flex items-start gap-1">
              <Info size={12} className="mt-0.5 shrink-0" />
              <span>Conversion automatique (×{food.cookedFactor}). Ton choix est mémorisé pour cet aliment.</span>
            </p>
          </div>
        )}

        <NumberInput
          label={`Quantité ${hasCookedFactor ? `(${cooked ? 'cuit' : 'cru/sec'})` : ''}`}
          value={grams}
          onChange={setGrams}
          suffix="g"
          min={0}
          step={1}
          autoFocus
        />

        {chips.length > 0 && (
          <div>
            <span className="block text-sm text-text-muted mb-1.5">Portions rapides</span>
            <div className="flex flex-wrap gap-1.5">
              {chips.map((q) => (
                <Chip
                  key={q.label}
                  active={q.grams === grams}
                  onClick={() => { haptic('selection'); setGrams(q.grams); }}
                >
                  {q.label} <span className="opacity-60">· {q.grams}g</span>
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl bg-surface-hi border border-border p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-text-muted">Aperçu macros</span>
            {inverseEquiv && (
              <span className="text-[11px] text-text-muted">
                ≈ {inverseEquiv.grams}g {inverseEquiv.state}
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <Macro label="Kcal" value={fmtKcal(preview.kcal)} />
            <Macro label="P"    value={fmtG(preview.protein)} />
            <Macro label="G"    value={fmtG(preview.carbs)} />
            <Macro label="L"    value={fmtG(preview.fat)} />
          </div>
        </div>

        <Button block onClick={() => onConfirm(typeof grams === 'number' ? grams : 0, cooked)} disabled={!grams}>
          Ajouter
        </Button>
      </div>
    </Sheet>
  );
}

function Chip({ children, onClick, active }: { children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        'h-9 px-3 rounded-full text-xs font-medium tap transition-colors',
        active ? 'bg-brand text-white' : 'bg-surface-hi text-text border border-border active:bg-surface'
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
