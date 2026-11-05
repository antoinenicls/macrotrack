import { useEffect, useState, type ReactNode } from 'react';
import { Sheet, Button } from '@/components/ui';
import { UtensilsCrossed, Minus, Plus, ChevronDown } from 'lucide-react';
import {
  presetsForSlot, otherPresetGroups, presetFor, estimateFor, estimateFromPortions,
  HAND_PORTIONS, ZERO_PORTIONS, PORTION_SIZES, EXTRAS,
  type HandPortionKey, type EatenOutPreset
} from '@/data/eatenOut';
import type { EatenOutCategory, EatenOutExtra, HandPortions, MealEstimate, MealSlot } from '@/types';
import { MEAL_LABEL } from '@/types';
import { haptic } from '@/lib/haptic';
import { fmtG, fmtKcal } from '@/lib/format';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Renvoie le snapshot d'estimation prêt à logger (catégorie OU portions à la main). */
  onPick: (estimate: MealEstimate) => void;
  /** Créneau concerné : détermine les catégories proposées (petit-déj ≠ dîner ≠ collation). */
  slot: MealSlot;
  /** Estimation déjà choisie (mode édition) : pré-remplit la bonne méthode. */
  current?: MealEstimate;
}

type Mode = 'hand' | 'category';
type Extras = Partial<Record<EatenOutExtra, number>>;

/**
 * Sélecteur d'estimation d'un repas NON PESÉ (extérieur ou préparé par quelqu'un d'autre).
 * Deux vitesses :
 *  - « À la main » : on compose l'assiette en portions (paume/poignée/pouce) → macros réelles.
 *  - « Rapide »    : le plat le plus proche (pizza, kebab, sushis…) ou un forfait, puis la
 *    taille de la portion.
 * Dans les deux cas, les suppléments (boisson, dessert, pain, sauce…) se comptent en plus :
 * c'est souvent eux qui font l'écart.
 */
export function EatenOutSheet({ open, onClose, onPick, slot, current }: Props) {
  const [mode, setMode] = useState<Mode>('hand');
  const [portions, setPortions] = useState<HandPortions>(ZERO_PORTIONS);
  const [dish, setDish] = useState<EatenOutCategory | null>(null);
  const [size, setSize] = useState(1);
  const [extras, setExtras] = useState<Extras>({});
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);

  // À l'ouverture, pré-remplit selon l'estimation en cours d'édition (ou repart à zéro).
  useEffect(() => {
    if (!open) return;
    const isCategory = !!current && current.method !== 'hand';
    setMode(isCategory ? 'category' : 'hand');
    setPortions(!isCategory && current?.portions ? current.portions : ZERO_PORTIONS);
    setDish(isCategory ? current?.category ?? null : null);
    setSize(isCategory ? current?.size ?? 1 : 1);
    setExtras(current?.extras ?? {});
    setExtrasOpen(!!current?.extras);
    setOthersOpen(false);
  }, [open, current]);

  const bump = (key: HandPortionKey, delta: number) => {
    haptic('selection');
    setPortions((p) => ({ ...p, [key]: Math.max(0, Math.round((p[key] + delta) * 2) / 2) }));
  };
  const bumpExtra = (key: EatenOutExtra, delta: number) => {
    haptic('selection');
    setExtras((e) => ({ ...e, [key]: Math.max(0, (e[key] ?? 0) + delta) }));
  };

  const preview = mode === 'hand'
    ? estimateFromPortions(portions, extras)
    : dish ? estimateFor(dish, size, extras) : null;
  const canAdd = (preview?.kcal ?? 0) > 0;
  const extrasCount = Object.values(extras).reduce((a, n) => a + (n ?? 0), 0);

  const pickDish = (p: EatenOutPreset) => {
    haptic('selection');
    setDish(p.category);
    setSize(1);
  };

  const presets = presetsForSlot(slot);
  const dishes = presets.filter((p) => !p.generic);
  const generics = presets.filter((p) => p.generic);

  const extrasSection = (
    <div className="rounded-2xl border border-border">
      <button
        onClick={() => { haptic('light'); setExtrasOpen((o) => !o); }}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 tap"
        aria-expanded={extrasOpen}
      >
        <span className="text-sm font-semibold">
          Suppléments <span className="font-normal text-text-muted">· boisson, dessert, pain, sauce…</span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          {extrasCount > 0 && <span className="text-xs font-bold text-brand">{extrasCount}</span>}
          <ChevronDown size={16} className={`text-text-muted transition-transform ${extrasOpen ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {extrasOpen && (
        <div className="px-3 pb-3 space-y-1.5">
          {EXTRAS.map((d) => {
            const n = extras[d.key] ?? 0;
            return (
              <div key={d.key} className="flex items-center gap-2.5">
                <span className="text-xl leading-none w-6 text-center shrink-0">{d.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug">
                    {d.label} <span className="text-text-muted font-normal">· {d.per.kcal} kcal</span>
                  </div>
                  <div className="text-[11px] text-text-muted leading-snug">{d.desc}</div>
                </div>
                <Counter value={n} label={d.label} onMinus={() => bumpExtra(d.key, -1)} onPlus={() => bumpExtra(d.key, +1)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const previewAndAdd = (
    <>
      {preview && (
        <div className="rounded-2xl bg-brand/5 border border-brand/20 px-4 py-3">
          <div className="text-lg font-extrabold text-brand">≈ {fmtKcal(preview.kcal)}</div>
          <div className="text-xs text-text-muted mt-0.5">
            P {fmtG(preview.protein)} · G {fmtG(preview.carbs)} · L {fmtG(preview.fat)} <span className="opacity-70">(estimé)</span>
          </div>
        </div>
      )}
      <Button
        className="w-full"
        disabled={!canAdd}
        onClick={() => { if (preview) { haptic('selection'); onPick(preview); } }}
      >
        {current ? 'Mettre à jour' : 'Ajouter ce repas'}
      </Button>
    </>
  );

  return (
    <Sheet open={open} onClose={onClose} title={`Estimer : ${MEAL_LABEL[slot]}`}>
      {/* Bascule de méthode */}
      <div className="flex rounded-2xl bg-surface-hi p-1 mb-3">
        {([['hand', 'À la main'], ['category', 'Rapide']] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => { haptic('selection'); setMode(m); }}
            className={[
              'flex-1 rounded-xl py-2 text-sm font-semibold tap transition-colors',
              mode === m ? 'bg-white text-text shadow-sm' : 'text-text-muted'
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'hand' ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Compose ton assiette avec tes mains, pas besoin de balance. Ajuste le nombre de
            portions pour chaque type (demi-portions possibles).
          </p>

          {HAND_PORTIONS.map((d) => {
            const n = portions[d.key];
            return (
              <div key={d.key} className="flex items-center gap-3 rounded-2xl border border-border px-3 py-2.5">
                <span className="text-2xl leading-none w-7 text-center shrink-0">{d.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">
                    {d.label} <span className="text-text-muted font-normal">· {d.gesture}</span>
                  </div>
                  <div className="text-xs text-text-muted leading-snug">{d.desc}</div>
                </div>
                <Counter value={n} label={d.label} onMinus={() => bump(d.key, -0.5)} onPlus={() => bump(d.key, +0.5)} />
              </div>
            );
          })}

          {extrasSection}
          {previewAndAdd}
        </div>
      ) : dish ? (
        <DishAdjust
          preset={presetFor(dish)}
          size={size}
          onSize={(v) => { haptic('selection'); setSize(v); }}
          onChange={() => { haptic('light'); setDish(null); }}
        >
          {extrasSection}
          {previewAndAdd}
        </DishAdjust>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            Choisis le plat le plus proche, puis ajuste la taille et les suppléments.
          </p>
          <DishGrid presets={dishes} active={current?.category} onPick={pickDish} />

          <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-text-muted pt-1">Rien ne ressemble ? Forfait</div>
          <div className="space-y-2">
            {generics.map((p) => (
              <button
                key={p.category}
                onClick={() => pickDish(p)}
                className={[
                  'w-full text-left rounded-2xl border px-4 py-3 tap transition-colors',
                  current?.category === p.category ? 'border-brand bg-brand/5' : 'border-border active:bg-surface-hi'
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold min-w-0 inline-flex items-center gap-2">
                    <UtensilsCrossed size={15} className="text-brand shrink-0" /> {p.label}
                  </span>
                  <span className="text-sm font-semibold text-brand whitespace-nowrap">≈ {p.kcal} kcal</span>
                </div>
                <div className="text-xs text-text-muted mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>

          <button
            onClick={() => { haptic('light'); setOthersOpen((o) => !o); }}
            className="w-full flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-2.5 text-xs font-semibold text-text-muted active:bg-surface-hi tap"
            aria-expanded={othersOpen}
          >
            Plats des autres moments de la journée
            <ChevronDown size={14} className={`transition-transform ${othersOpen ? 'rotate-180' : ''}`} />
          </button>
          {othersOpen && otherPresetGroups(slot).map((g) => (
            <div key={g.label} className="space-y-2">
              <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-text-muted">{g.label}</div>
              <DishGrid presets={g.presets} active={current?.category} onPick={pickDish} />
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function DishGrid({ presets, active, onPick }: {
  presets: EatenOutPreset[];
  active?: EatenOutCategory;
  onPick: (p: EatenOutPreset) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {presets.map((p) => (
        <button
          key={p.category}
          onClick={() => onPick(p)}
          className={[
            'text-left rounded-2xl border px-3 py-2.5 tap transition-colors min-w-0',
            active === p.category ? 'border-brand bg-brand/5' : 'border-border active:bg-surface-hi'
          ].join(' ')}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl leading-none shrink-0">{p.emoji}</span>
            <span className="text-sm font-semibold leading-tight min-w-0 break-words">{p.label}</span>
          </div>
          <div className="text-xs font-semibold text-brand mt-1">≈ {p.kcal} kcal</div>
        </button>
      ))}
    </div>
  );
}

function DishAdjust({ preset, size, onSize, onChange, children }: {
  preset: EatenOutPreset;
  size: number;
  onSize: (v: number) => void;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-2xl border border-brand/40 bg-brand/5 px-3 py-2.5">
        <span className="text-2xl leading-none shrink-0">{preset.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{preset.label}</div>
          <div className="text-xs text-text-muted">{preset.desc}</div>
        </div>
        <button onClick={onChange} className="shrink-0 text-xs font-semibold text-brand tap px-2 py-1">Changer</button>
      </div>

      <div>
        <div className="text-sm font-semibold mb-1.5">Taille de la portion</div>
        <div className="grid grid-cols-4 gap-1.5">
          {PORTION_SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => onSize(s.value)}
              className={[
                'rounded-xl border py-2 tap transition-colors text-center',
                size === s.value ? 'border-brand bg-brand/10 text-brand' : 'border-border text-text-muted active:bg-surface-hi'
              ].join(' ')}
            >
              <div className="text-xs font-semibold">{s.label}</div>
              <div className="text-[10px] tabular-nums">{Math.round(preset.kcal * s.value)}</div>
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function Counter({ value, label, onMinus, onPlus }: { value: number; label: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={onMinus}
        disabled={value <= 0}
        aria-label={`Moins de ${label}`}
        className="w-9 h-9 grid place-items-center rounded-xl border border-border tap active:bg-surface-hi disabled:opacity-30"
      >
        <Minus size={16} />
      </button>
      <span className="w-7 text-center font-bold tabular-nums">{formatCount(value)}</span>
      <button
        onClick={onPlus}
        aria-label={`Plus de ${label}`}
        className="w-9 h-9 grid place-items-center rounded-xl border border-border tap active:bg-surface-hi"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}

function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}
