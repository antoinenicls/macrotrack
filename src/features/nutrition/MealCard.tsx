import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SwipeAction, Button, NumberInput, IconButton } from '@/components/ui';
import { CheckCircle2, CircleDot, Circle, PlusCircle, Check, Pencil, Sunrise, Sun, Moon, Cookie, UtensilsCrossed, Trash2, Repeat } from 'lucide-react';
import { useFoodsStore } from '@/store/foodsStore';
import { macrosForItem, sumMacros } from '@/lib/nutrition';
import { templatePortionState } from '@/lib/portions';
import { fmtG, fmtKcal, describeServing, rawEquivLabel } from '@/lib/format';
import { haptic } from '@/lib/haptic';
import { describeEstimate } from '@/data/eatenOut';
import type { Meal, MealItem, MealSlot, PlanTemplateMeal } from '@/types';
import { MEAL_LABEL } from '@/types';

interface Props {
  slot: MealSlot;
  meal?: Meal;
  template?: PlanTemplateMeal;
  /** Plan d'origine du repas quand `template` a été recalé autour d'un repas estimé. */
  baseTemplate?: PlanTemplateMeal;
  /** Si faux, lecture seule : on ne peut ni cocher ni modifier (jours ≠ aujourd'hui). */
  editable?: boolean;
  onEditPress: (mealId: string, index: number, item: MealItem) => void;
  onRemove: (index: number) => void;
  /** Définit la quantité déjà consommée d'un item du plan (0 = rien, = prévu → tout mangé). */
  onSetPortion: (foodId: string, consumedGrams: number, cooked: boolean) => void;
  /** Ouvre le sélecteur "mangé à l'extérieur" pour ce repas. */
  onEatOut: () => void;
  /** Ouvre le remplacement d'un aliment du plan ("pas envie de ça"). */
  onSwap: (foodId: string, grams: number, cooked: boolean) => void;
  /** Édite un repas extérieur déjà loggé (rouvre le sélecteur de catégorie). */
  onEditEstimate: (mealId: string, index: number, item: MealItem) => void;
}

// Rose/magenta "portion entamée" — volontairement TRÈS distinct des couleurs de repas
// (lime, jaune, pêche, lavande) pour ne jamais confondre "entamé" et "repas validé".
const PARTIAL = '#DB2777';
// Ambre "portion dépassée" — mangé PLUS que prévu : distinct du rose (moins que prévu) et
// des couleurs de repas. Sémantique "attention, au-dessus du plan" (calories en plus).
const OVER = '#D97706';

// Couleurs vives + icône par repas (HARDCODED pour bulletproof anti-dark)
const SLOT_IDENTITY: Record<MealSlot, { icon: typeof Sunrise; bg: string }> = {
  'petit-dej':  { icon: Sunrise, bg: '#A4D85B' },  // vert lime — volontairement HORS identité bleue
  'dejeuner':   { icon: Sun,     bg: '#F3D843' },  // jaune
  'diner':      { icon: Moon,    bg: '#F4A571' },  // peach
  'collation':  { icon: Cookie,  bg: '#B2A0E0' }   // lavande
};

/**
 * Carte de repas style "inspiration" :
 *  - Header en plein couleur du slot (vert/jaune/peach/lavande), texte noir bold
 *  - Body blanc avec checkboxes
 *  - Portion fractionnée : on peut noter la quantité déjà mangée (½ sur la journée),
 *    la carte affiche alors le RESTE à manger pour ne pas exploser les calories.
 */
export function MealCard({
  slot, meal, template, baseTemplate, editable = true,
  onEditPress, onRemove, onSetPortion, onEatOut, onEditEstimate, onSwap
}: Props) {
  const byId = useFoodsStore((s) => s.byId);
  const items = meal?.items ?? [];
  const totals = sumMacros(items.map((it) => macrosForItem(byId(it.foodId), it)));
  const hasEstimate = items.some((it) => it.estimate);
  // Confirmation de suppression d'un repas extérieur (index de l'item), pattern Poids.
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const templateItems = template?.items ?? [];
  const templateFoodIds = new Set(templateItems.map((t) => t.foodId));

  const extraItems = items
    .map((it, idx) => ({ it, idx }))
    .filter(({ it }) => !it.fromTemplate || !templateFoodIds.has(it.foodId));

  // Portion d'un item du plan : quantité déjà consommée vs prévue, le reste, le dépassement.
  const portionOf = (foodId: string, planned: number) => {
    const ci = items.find((it) => it.foodId === foodId && it.fromTemplate);
    return templatePortionState(ci?.grams ?? 0, planned);
  };

  const { icon: Icon, bg } = SLOT_IDENTITY[slot];
  const allTemplateChecked = templateItems.length > 0 && templateItems.every((t) => portionOf(t.foodId, t.grams).full);

  // Éditeur de portion fractionnée (inline), même esprit que l'éditeur de stock de la vue semaine.
  const [openPortionId, setOpenPortionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<number | ''>('');

  const openPortion = (foodId: string, consumed: number) => {
    haptic('light');
    setOpenPortionId((prev) => (prev === foodId ? null : foodId));
    setDraft(consumed > 0 ? Math.round(consumed * 10) / 10 : '');
  };
  // Applique en direct : la carte reflète le reste immédiatement (pas de bouton "Enregistrer").
  const applyPortion = (foodId: string, grams: number | '', cooked: boolean) => {
    const v = grams === '' ? 0 : Math.max(0, Math.round(grams * 10) / 10);
    setDraft(grams === '' ? '' : v);
    onSetPortion(foodId, v, cooked);
  };

  return (
    <div className="rounded-3xl overflow-hidden shadow-card" style={{ backgroundColor: '#FFFFFF' }}>
      {/* HEADER en couleur pleine — texte NOIR hardcoded pour lisibilité */}
      <div
        className="px-5 py-4 flex items-center gap-3"
        style={{ backgroundColor: bg }}
      >
        <div className="rounded-2xl p-2 shrink-0" style={{ backgroundColor: 'rgba(255,255,255,0.55)' }}>
          <Icon size={22} strokeWidth={2.5} style={{ color: '#111827' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-extrabold leading-tight tracking-tight" style={{ color: '#111827' }}>
            {MEAL_LABEL[slot]}
          </h3>
          <div className="text-xs font-medium mt-0.5" style={{ color: 'rgba(17,24,39,0.75)' }}>
            {fmtKcal(totals.kcal)} · P {fmtG(totals.protein)} · G {fmtG(totals.carbs)} · L {fmtG(totals.fat)}
          </div>
        </div>
        <AnimatePresence>
          {allTemplateChecked && (
            <motion.div
              key="done"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="shrink-0 rounded-full inline-flex items-center gap-1 px-2.5 h-7"
              style={{ backgroundColor: 'rgba(17,24,39,0.88)' }}
            >
              <Check size={14} strokeWidth={3.5} style={{ color: '#FFFFFF' }} />
              <span className="text-xs font-extrabold" style={{ color: '#FFFFFF' }}>Mangé</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* BODY blanc avec contenu */}
      <div className="px-5 py-4 space-y-3" style={{ backgroundColor: '#FFFFFF', color: '#111827' }}>
        {templateItems.length > 0 && (
          <ul className="space-y-1.5">
            {templateItems.map((t) => {
              const food = byId(t.foodId);
              const { consumed, full, over, partial, remaining, excess } = portionOf(t.foodId, t.grams);
              const serving = food?.commonServings?.[0];
              const equiv = serving ? describeServing(t.grams, serving) : null;
              const rawEq = food ? rawEquivLabel(food, t.grams, t.cooked) : null;
              const editorOpen = openPortionId === t.foodId;
              // Aliment du plan non touché alors qu'on a mangé dehors sur ce repas → "remplacé".
              // Reste tappable : si on l'a quand même mangé (supplément), un tap le valide.
              const replaced = hasEstimate && consumed <= 0;
              // Portion recalée autour d'un repas estimé : on rappelle la quantité d'origine.
              const baseGrams = baseTemplate?.items.find((b) => b.foodId === t.foodId)?.grams;
              const adjustedFrom = baseGrams != null && baseGrams !== t.grams ? baseGrams : null;

              const rowInner = (
                <>
                  {/* Coche : vide → entamée (rose) → mangée (couleur repas) ; "remplacé" si mangé dehors */}
                  <motion.span
                    key={replaced ? 'repl' : over ? 'over' : full ? 'on' : partial ? 'part' : 'off'}
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                    className="shrink-0"
                  >
                    {replaced
                      ? <UtensilsCrossed size={22} className="text-text-muted/40" />
                      : over
                        ? <PlusCircle size={24} strokeWidth={2.5} style={{ color: OVER }} />
                        : full
                          ? <CheckCircle2 size={24} strokeWidth={2.5} style={{ color: bg }} />
                          : partial
                            ? <CircleDot size={24} strokeWidth={2.5} style={{ color: PARTIAL }} />
                            : <Circle size={24} className="text-text-muted/40" />}
                  </motion.span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[15px] leading-snug break-words transition-all ${replaced ? 'font-medium text-text-muted/60 line-through' : full || partial ? 'font-bold text-text' : 'font-semibold text-text-muted'}`}>
                      {food?.name ?? '–'}
                    </div>
                    {replaced ? null : partial ? (
                      <div className="text-xs font-semibold mt-0.5" style={{ color: PARTIAL }}>
                        Déjà mangé {fmtG(consumed)}
                      </div>
                    ) : over ? (
                      <div className="text-xs font-semibold mt-0.5" style={{ color: OVER }}>
                        Mangé {fmtG(consumed)} · +{fmtG(excess)} vs prévu
                      </div>
                    ) : adjustedFrom != null ? (
                      <>
                        {equiv && <div className="text-xs text-text-muted/80 mt-0.5">≈ {equiv}</div>}
                        <div className="text-xs font-semibold text-brand mt-0.5">Ajusté · prévu {adjustedFrom} g</div>
                      </>
                    ) : equiv ? (
                      <div className="text-xs text-text-muted/80 mt-0.5">≈ {equiv}</div>
                    ) : null}
                  </div>
                  <div className={`text-xs shrink-0 text-right tabular-nums ${replaced ? 'text-text-muted/60' : full ? 'font-bold text-text' : 'text-text-muted'}`}>
                    {replaced ? (
                      <>
                        <div className="font-semibold whitespace-nowrap">remplacé</div>
                        <div className="text-[10px] font-normal text-text-muted/60 whitespace-nowrap">mangé dehors</div>
                      </>
                    ) : partial ? (
                      <>
                        <div className="font-bold whitespace-nowrap" style={{ color: PARTIAL }}>reste {fmtG(remaining)}</div>
                        <div className="text-[10px] font-normal text-text-muted/70 whitespace-nowrap">prévu {fmtG(t.grams)}</div>
                      </>
                    ) : over ? (
                      <>
                        <div className="font-bold whitespace-nowrap" style={{ color: OVER }}>{fmtG(consumed)} {t.cooked ? 'cuit' : ''}</div>
                        <div className="text-[10px] font-normal text-text-muted/70 whitespace-nowrap">prévu {fmtG(t.grams)}</div>
                      </>
                    ) : (
                      <>
                        <div className="whitespace-nowrap">{t.grams}g {t.cooked ? 'cuit' : ''}</div>
                        {rawEq && <div className="text-[10px] font-normal text-text-muted/70 whitespace-nowrap">{rawEq}</div>}
                      </>
                    )}
                  </div>
                </>
              );

              const rowStyle = replaced
                ? { backgroundColor: 'transparent', borderColor: 'rgba(17,24,39,0.10)', borderStyle: 'dashed' as const }
                : over
                  ? { backgroundColor: 'rgba(217,119,6,0.10)', borderColor: 'rgba(217,119,6,0.45)' }  // ambre "dépassé"
                  : full
                    ? { backgroundColor: `${bg}29`, borderColor: bg }                  // teinte de la couleur du repas
                    : partial
                      ? { backgroundColor: 'rgba(219,39,119,0.09)', borderColor: 'rgba(219,39,119,0.45)' }
                      : { backgroundColor: 'transparent', borderColor: 'transparent' };

              return (
                <li key={t.foodId}>
                  <div className="flex items-center gap-1.5">
                    {editable ? (
                      <motion.button
                        onClick={() => {
                          haptic('selection');
                          // Tap = "tout mangé" / "annuler". La portion fine passe par le bouton ½.
                          onSetPortion(t.foodId, full ? 0 : t.grams, t.cooked);
                          if (editorOpen) setOpenPortionId(null);
                        }}
                        whileTap={{ scale: 0.97 }}
                        className="flex-1 min-w-0 flex items-center gap-3 py-2.5 rounded-2xl px-3 tap text-left border transition-colors duration-200"
                        style={rowStyle}
                      >
                        {rowInner}
                      </motion.button>
                    ) : (
                      <div
                        className="flex-1 min-w-0 flex items-center gap-3 py-2.5 rounded-2xl px-3 text-left border transition-colors duration-200"
                        style={rowStyle}
                      >
                        {rowInner}
                      </div>
                    )}
                    {editable && !replaced && (
                      <button
                        onClick={() => { haptic('light'); onSwap(t.foodId, t.grams, t.cooked); }}
                        aria-label={`Remplacer ${food?.name ?? ''}`}
                        className="shrink-0 w-9 h-9 grid place-items-center rounded-xl border tap transition-colors text-text-muted active:bg-surface-hi"
                      >
                        <Repeat size={15} />
                      </button>
                    )}
                    {editable && !replaced && (
                      <button
                        onClick={() => openPortion(t.foodId, consumed)}
                        aria-label={`Portion déjà mangée de ${food?.name ?? ''}`}
                        aria-expanded={editorOpen}
                        className="shrink-0 w-9 h-9 grid place-items-center rounded-xl border tap transition-colors text-text-muted active:bg-surface-hi"
                        style={over
                          ? { color: OVER, borderColor: 'rgba(217,119,6,0.5)', backgroundColor: 'rgba(217,119,6,0.10)' }
                          : editorOpen || partial
                            ? { color: PARTIAL, borderColor: 'rgba(219,39,119,0.5)', backgroundColor: 'rgba(219,39,119,0.10)' }
                            : undefined}
                      >
                        <span className="text-sm font-bold leading-none">½</span>
                      </button>
                    )}
                  </div>

                  {/* Éditeur de portion fractionnée inline */}
                  {editable && editorOpen && (
                    <div className="mt-1.5 rounded-2xl border border-border bg-surface-hi p-3 space-y-2">
                      <div className="text-xs text-text-muted">
                        Portion prévue : <span className="font-semibold text-text">{t.grams} g</span>
                        {equiv && <> · ≈ {equiv}</>}
                      </div>
                      <NumberInput
                        value={draft}
                        onChange={(v) => applyPortion(t.foodId, v, t.cooked)}
                        suffix="g"
                        min={0}
                        placeholder="0"
                        hint="Quantité déjà mangée aujourd'hui"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={() => applyPortion(t.foodId, Math.round((t.grams / 2) * 10) / 10, t.cooked)}>Moitié</Button>
                        <Button variant="secondary" size="sm" onClick={() => applyPortion(t.foodId, t.grams, t.cooked)}>Tout mangé</Button>
                        <Button variant="secondary" size="sm" onClick={() => applyPortion(t.foodId, 0, t.cooked)}>Rien</Button>
                        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpenPortionId(null)}>Fermer</Button>
                      </div>
                      {consumed > 0 && remaining > 0 ? (
                        <div className="text-xs font-semibold" style={{ color: PARTIAL }}>
                          ⚠️ Il te reste {fmtG(remaining)} à manger pour ce repas, ne mange pas tout.
                        </div>
                      ) : over ? (
                        <div className="text-xs font-semibold" style={{ color: OVER }}>
                          +{fmtG(excess)} de plus que les {fmtG(t.grams)} prévus. Les calories en plus sont bien comptées.
                        </div>
                      ) : consumed > 0 ? (
                        <div className="text-xs font-semibold text-brand">Portion entièrement mangée ✓</div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {extraItems.length > 0 && (
          <>
            {templateItems.length > 0 && (
              <div className="text-[10px] uppercase tracking-[0.12em] font-bold text-text-muted pt-1">Hors plan</div>
            )}
            <ul className="space-y-2">
              {extraItems.map(({ it, idx }) => {
                // Repas pris à l'extérieur : rendu dédié (estimation, pas d'aliment).
                if (it.estimate) {
                  const est = it.estimate;
                  const { label, detail } = describeEstimate(est);
                  const estInner = (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold min-w-0 flex items-start gap-1.5 leading-snug">
                          <UtensilsCrossed size={14} className="text-brand shrink-0 mt-1" /> <span className="break-words">{label}</span>
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(219,39,119,0.12)', color: PARTIAL }}>Estimé</span>
                          {editable && <Pencil size={12} className="text-text-muted" />}
                        </div>
                      </div>
                      {detail && <div className="text-xs text-text-muted mt-0.5">{detail}</div>}
                      <div className="text-xs text-text-muted mt-0.5">
                        ≈ {fmtKcal(est.kcal)} • P {fmtG(est.protein)} • G {fmtG(est.carbs)} • L {fmtG(est.fat)} · estimé
                      </div>
                    </>
                  );
                  return (
                    <li key={`est-${idx}`}>
                      {confirmDeleteIdx === idx ? (
                        <div className="px-3 py-2.5 flex items-center justify-between gap-3 rounded-2xl bg-danger/10 border border-danger/30">
                          <span className="text-sm text-text flex-1 min-w-0">Supprimer ce repas extérieur ?</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setConfirmDeleteIdx(null)}
                              className="text-xs font-medium text-text-muted active:text-text tap px-2 py-1"
                            >
                              Annuler
                            </button>
                            <button
                              onClick={() => { setConfirmDeleteIdx(null); onRemove(idx); }}
                              className="text-xs font-semibold text-white bg-danger rounded-lg px-3 py-1.5 tap active:opacity-80"
                            >
                              Supprimer
                            </button>
                          </div>
                        </div>
                      ) : editable ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            className="flex-1 min-w-0 text-left px-3 py-2.5 rounded-2xl active:bg-surface tap"
                            onClick={() => meal && onEditEstimate(meal.id, idx, it)}
                          >
                            {estInner}
                          </button>
                          <IconButton label="Supprimer" onClick={() => setConfirmDeleteIdx(idx)}>
                            <Trash2 size={16} className="text-text-muted" />
                          </IconButton>
                        </div>
                      ) : (
                        <div className="w-full text-left px-3 py-2.5">{estInner}</div>
                      )}
                    </li>
                  );
                }
                const food = byId(it.foodId);
                const macros = macrosForItem(food, it);
                const serving = food?.commonServings?.[0];
                const equiv = serving ? describeServing(it.grams, serving) : null;
                const extraInner = (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold min-w-0 leading-snug break-words">{food?.name ?? 'Aliment supprimé'}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-text-muted text-right">
                          {it.grams}g {it.cooked ? 'cuit' : ''}
                          {equiv && <span className="block">≈ {equiv}</span>}
                        </span>
                        {editable && <Pencil size={12} className="text-text-muted" />}
                      </div>
                    </div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {fmtKcal(macros.kcal)} • P {fmtG(macros.protein)} • G {fmtG(macros.carbs)} • L {fmtG(macros.fat)}
                    </div>
                  </>
                );
                return (
                  <li key={`${it.foodId}-${idx}`}>
                    {editable ? (
                      <SwipeAction onDelete={() => onRemove(idx)}>
                        <button
                          className="w-full text-left px-3 py-2.5 active:bg-surface"
                          onClick={() => meal && onEditPress(meal.id, idx, it)}
                        >
                          {extraInner}
                        </button>
                      </SwipeAction>
                    ) : (
                      <div className="w-full text-left px-3 py-2.5">
                        {extraInner}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {items.length === 0 && templateItems.length === 0 && (
          <p className="text-sm text-text-muted py-2">Aucun aliment pour ce repas.</p>
        )}

        {editable && !hasEstimate && (
          <button
            onClick={() => { haptic('light'); onEatOut(); }}
            className="w-full mt-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-2.5 text-xs font-semibold text-text-muted active:bg-surface-hi tap"
          >
            <UtensilsCrossed size={14} /> Estimer ce repas (non pesé)
          </button>
        )}
      </div>
    </div>
  );
}
