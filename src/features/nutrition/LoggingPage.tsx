import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button, Card } from '@/components/ui';
import { CalendarRange, ChevronRight, Lock, Unlock } from 'lucide-react';
import { MealCard } from './MealCard';
import { FoodSearchSheet } from './FoodSearchSheet';
import { QuantitySheet } from './QuantitySheet';
import { EatenOutSheet } from './EatenOutSheet';
import { SwapSheet } from './SwapSheet';
import { EATEN_OUT_FOOD_ID } from '@/data/eatenOut';
import type { MealEstimate } from '@/types';
import { DayStrip } from './DayStrip';
import { WeekView } from '@/features/plan/WeekView';
import { useLogStore } from '@/store/logStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { MEAL_SLOTS, type Food, type MealItem, type MealSlot } from '@/types';
import { formatHumanDate, todayKey } from '@/lib/dates';
import { effectiveTargets, macrosForItem, sumMacros } from '@/lib/nutrition';
import { fmtG, fmtKcal } from '@/lib/format';
import { getTemplateForDate } from '@/lib/templates';
import { activeSlotsOf } from '@/lib/mealStructure';
import { applyCarryOver, carryOverFor, carryPerDay, carrySettingsOf, pendingSlots, planKcal, rebalanceForEstimates, reduceTargets } from '@/lib/estimateRebalance';
import { EstimateBalanceCard } from './EstimateBalanceCard';

type EditTarget = { mealId: string; index: number; item: MealItem; food: Food } | null;

export function LoggingPage() {
  const [params] = useSearchParams();
  const initialSlot = (params.get('slot') as MealSlot | null);

  const date = useLogStore((s) => s.date);
  const meals = useLogStore((s) => s.meals);
  const loading = useLogStore((s) => s.loading);
  const setDate = useLogStore((s) => s.setDate);
  const addItem = useLogStore((s) => s.addItem);
  const updateItem = useLogStore((s) => s.updateItem);
  const removeItem = useLogStore((s) => s.removeItem);
  const addEstimatedMeal = useLogStore((s) => s.addEstimatedMeal);
  const setTemplatePortion = useLogStore((s) => s.setTemplatePortion);
  const settings = useProfileStore((s) => s.settings);
  const profile = useProfileStore((s) => s.profile);
  const setEstimateSurplus = useProfileStore((s) => s.setEstimateSurplus);
  const byId = useFoodsStore((s) => s.byId);
  const foodsLen = useFoodsStore((s) => s.foods.length);
  const toast = useUIStore((s) => s.toast);

  const [searchOpen, setSearchOpen] = useState(false);
  const [qtyOpen, setQtyOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<MealSlot>(initialSlot ?? 'petit-dej');
  const [pickedFood, setPickedFood] = useState<Food | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  // Sélecteur "mangé à l'extérieur"
  const [eatOutOpen, setEatOutOpen] = useState(false);
  const [eatOutSlot, setEatOutSlot] = useState<MealSlot>('dejeuner');
  const [eatOutEdit, setEatOutEdit] = useState<{ mealId: string; index: number } | null>(null);
  const [eatOutCurrent, setEatOutCurrent] = useState<MealEstimate | undefined>(undefined);
  // Mode édition pour les jours ≠ aujourd'hui (verrouillé par défaut)
  const [editMode, setEditMode] = useState(false);
  // Remplacement d'un aliment du plan ("pas envie de ça")
  const [swapTarget, setSwapTarget] = useState<{ food: Food; grams: number; cooked: boolean; slot: MealSlot } | null>(null);

  useEffect(() => {
    if (initialSlot) {
      setActiveSlot(initialSlot);
      setSearchOpen(true);
    }
  }, [initialSlot]);

  // Repasse en lecture seule dès qu'on change de jour
  useEffect(() => { setEditMode(false); }, [date]);

  const handlePickFood = (food: Food) => {
    setPickedFood(food);
    setSearchOpen(false);
    setQtyOpen(true);
  };

  const handleConfirm = async (grams: number, cooked: boolean) => {
    if (editTarget) {
      await updateItem(editTarget.mealId, editTarget.index, { ...editTarget.item, grams, cooked });
      toast('Aliment modifié', 'success');
    } else if (pickedFood) {
      await addItem(activeSlot, { foodId: pickedFood.id, grams, cooked });
      toast('Aliment ajouté', 'success');
    }
    setQtyOpen(false);
    setPickedFood(null);
    setEditTarget(null);
  };

  const handleRemove = async (slot: MealSlot, index: number) => {
    const meal = meals.find((m) => m.slot === slot);
    if (!meal) return;
    const removed = meal.items[index];
    if (!removed) return;
    await removeItem(meal.id, index);
    toast('Aliment supprimé', 'success', {
      action: { label: 'Annuler', onPress: () => addItem(slot, removed) }
    });
  };

  const handleEdit = (slot: MealSlot, mealId: string, index: number, item: MealItem) => {
    const food = useFoodsStore.getState().byId(item.foodId);
    if (!food) return;
    setActiveSlot(slot);
    setPickedFood(food);
    setEditTarget({ mealId, index, item, food });
    setQtyOpen(true);
  };

  const openEatOut = (slot: MealSlot) => {
    setEatOutSlot(slot);
    setEatOutEdit(null);
    setEatOutCurrent(undefined);
    setEatOutOpen(true);
  };

  const openEditEstimate = (slot: MealSlot, mealId: string, index: number, item: MealItem) => {
    setEatOutSlot(slot);
    setEatOutEdit({ mealId, index });
    setEatOutCurrent(item.estimate);
    setEatOutOpen(true);
  };

  const handleEatOutPick = async (picked: MealEstimate) => {
    // Repas recalés autour de l'estimation : ceux pas encore entamés à la 1ʳᵉ saisie, gardés
    // tels quels en modification (ils ont pu être mangés depuis, aux portions recalées).
    const estimate = { ...picked, rebalanceSlots: eatOutCurrent?.rebalanceSlots ?? pendingSlots(dayPlan, meals, eatOutSlot) };
    if (eatOutEdit) {
      await updateItem(eatOutEdit.mealId, eatOutEdit.index, { foodId: EATEN_OUT_FOOD_ID, grams: 0, cooked: false, estimate });
      toast('Repas extérieur modifié', 'success');
    } else {
      await addEstimatedMeal(eatOutSlot, estimate);
      toast('Repas extérieur ajouté', 'success');
    }
    setEatOutOpen(false);
    setEatOutEdit(null);
  };

  // Totaux de la journée affichée (loggé)
  const totals = sumMacros(meals.flatMap((m) => m.items).map((it) => macrosForItem(byId(it.foodId), it)));
  const baseTargets = profile ? effectiveTargets(profile) : null;
  const activeSlots = activeSlotsOf(settings?.activeSlots);
  const isToday = date === todayKey();
  const isFuture = date > todayKey();
  // Lecture seule sur les autres jours, sauf si on a explicitement activé l'édition
  const canEdit = isToday || editMode;
  // Total prévu du jour (plan type) — affiché pour les jours futurs
  const dayPlan = settings ? getTemplateForDate(date, settings) : [];
  // Surplus d'un repas estimé des jours précédents, reporté sur celui-ci (féculents et gras).
  const dayKcal = planKcal(dayPlan, byId);
  const carry = carrySettingsOf(settings);
  const carryIn = carryOverFor(date, settings?.estimateSurplus, dayKcal, carry);
  const targets = baseTargets ? reduceTargets(baseTargets, carryIn) : null;
  // Repas estimé (non pesé) : les repas restants se recalent pour garder la journée sur sa cible.
  const rebalance = rebalanceForEstimates(applyCarryOver(dayPlan, carryIn, byId), meals, byId);

  // Mémorise le surplus non compensable du jour affiché pour le reporter sur les suivants.
  // Seulement une fois le log de CE jour et les aliments chargés (sinon surplus faussé).
  const surplus = rebalance.uncompensatedKcal;
  useEffect(() => {
    if (loading || foodsLen === 0 || !settings || meals.some((m) => m.date !== date)) return;
    void setEstimateSurplus(date, surplus);
  }, [loading, foodsLen, settings, meals, date, surplus, setEstimateSurplus]);
  const planTotals = sumMacros(
    rebalance.plan.flatMap((m) => m.items).map((it) => macrosForItem(byId(it.foodId), { foodId: it.foodId, grams: it.grams, cooked: it.cooked }))
  );
  // Re-render gracieux quand les foods chargent
  void foodsLen;

  return (
    <div className="space-y-4 px-5 pb-5">
      <PageHeader subtitle={isToday ? "Aujourd'hui" : formatHumanDate(date)} title={isToday ? 'Repas' : 'Repas'} />

      {/* Bouton vue semaine — en haut comme demandé, accessible toujours */}
      <button
        onClick={() => setWeekOpen(true)}
        className="w-full flex items-center gap-3 bg-surface-hi rounded-2xl border border-border p-3 tap active:bg-surface"
      >
        <div className="rounded-xl bg-brand/15 text-brand p-2">
          <CalendarRange size={18} />
        </div>
        <div className="flex-1 text-left">
          <div className="font-semibold text-sm">Vue semaine & liste de courses</div>
          <div className="text-xs text-text-muted">Voir / préparer les 7 prochains jours</div>
        </div>
        <ChevronRight size={18} className="text-text-muted" />
      </button>

      {/* Bande de jours pour naviguer */}
      <DayStrip selectedDate={date} onSelect={setDate} />

      {/* Bannière de contexte selon le jour */}
      {!isToday && (
        <Card className={isFuture ? 'border-brand/40 bg-brand/5' : 'border-border'}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold capitalize">{formatHumanDate(date)}</div>
              <div className="text-xs text-text-muted mt-0.5">
                {isFuture ? (
                  <>{fmtKcal(planTotals.kcal)} • P {fmtG(planTotals.protein)} G {fmtG(planTotals.carbs)} L {fmtG(planTotals.fat)}</>
                ) : (
                  <>
                    Journée passée · {fmtKcal(totals.kcal)} • P {fmtG(totals.protein)} G {fmtG(totals.carbs)} L {fmtG(totals.fat)}
                    {targets && <span className="text-text-muted/70"> / {targets.kcal}</span>}
                  </>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0 whitespace-nowrap border border-brand text-brand font-semibold"
              onClick={() => setDate(todayKey())}
            >
              Aujourd'hui
            </Button>
          </div>
        </Card>
      )}

      {/* Édition verrouillée hors "aujourd'hui" : on consulte, on ne coche pas par défaut */}
      {!isToday && (
        editMode ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-brand/40 bg-brand/5 px-4 py-2.5">
            <span className="text-sm font-medium text-brand inline-flex items-center gap-2">
              <Unlock size={15} /> Modifications activées
            </span>
            <button
              onClick={() => setEditMode(false)}
              className="text-xs font-semibold text-text-muted active:text-text tap px-2 py-1"
            >
              Terminer
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditMode(true)}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-text-muted active:bg-surface-hi tap"
          >
            <Lock size={15} /> Voulez-vous faire une modification ?
          </button>
        )
      )}

      <EstimateBalanceCard rebalance={rebalance} carryIn={carryIn} carryOut={carryPerDay(surplus, dayKcal, carry)} carryDays={carry.enabled ? carry.days : 0} />

      {MEAL_SLOTS.map((slot) => {
        const meal = meals.find((m) => m.slot === slot);
        const tpl = rebalance.plan.find((p) => p.slot === slot);
        // Repas désactivé dans la structure : on le masque, SAUF si quelque chose y a été
        // logué malgré tout (un écart, un repas extérieur) — sinon on l'effacerait de la vue.
        const inactive = !activeSlots.includes(slot);
        if (inactive && !meal?.items.length && !tpl?.items.length) return null;
        return (
          <MealCard
            key={slot}
            slot={slot}
            meal={meal}
            template={tpl}
            baseTemplate={dayPlan.find((p) => p.slot === slot)}
            editable={canEdit}
            onEditPress={(mealId, idx, item) => handleEdit(slot, mealId, idx, item)}
            onRemove={(idx) => handleRemove(slot, idx)}
            onSetPortion={(fId, g, c) => setTemplatePortion(slot, fId, g, c)}
            onEatOut={() => openEatOut(slot)}
            onEditEstimate={(mealId, idx, item) => openEditEstimate(slot, mealId, idx, item)}
            onSwap={(foodId, grams, cooked) => {
              const food = byId(foodId);
              if (food) setSwapTarget({ food, grams, cooked, slot });
            }}
          />
        );
      })}

      <FoodSearchSheet
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handlePickFood}
      />
      <QuantitySheet
        open={qtyOpen}
        food={pickedFood}
        initialGrams={editTarget?.item.grams}
        initialCooked={editTarget?.item.cooked}
        onClose={() => { setQtyOpen(false); setEditTarget(null); }}
        onConfirm={handleConfirm}
      />
      <SwapSheet
        open={swapTarget !== null}
        target={swapTarget}
        dateKey={date}
        onClose={() => setSwapTarget(null)}
      />
      <WeekView open={weekOpen} onClose={() => setWeekOpen(false)} />
      <EatenOutSheet
        open={eatOutOpen}
        slot={eatOutSlot}
        current={eatOutCurrent}
        onPick={handleEatOutPick}
        onClose={() => { setEatOutOpen(false); setEatOutEdit(null); }}
      />
    </div>
  );
}
