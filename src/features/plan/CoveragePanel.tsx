import { useMemo } from 'react';
import { CollapsibleCard, HelpHint } from '@/components/ui';
import { Check, AlertTriangle, Plus, ClipboardCheck } from 'lucide-react';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { NUTRIENT_META, weeklyCoverage, planMacroGap, proteinMealBalance } from '@/lib/coverage';
import { usableFoodIds, isExcluded } from '@/lib/diet';
import { haptic } from '@/lib/haptic';
import { MEAL_LABEL } from '@/types';

/**
 * « Ce que ta semaine couvre » : contrôle de qualité du plan RÉELLEMENT appliqué.
 *
 * Les macros peuvent être parfaites et la diète appauvrie : remplacer les sardines par
 * du poulet ne change ni les calories ni les protéines, et fait disparaître les oméga-3.
 * Ce panneau regarde le plan tel qu'il est construit et signale ce qui manque, avec les
 * aliments à cocher pour le combler (un tap suffit, la diète se reconstruit ensuite).
 *
 * Il affiche aussi le cas où la sélection ne PEUT PAS tenir la cible (trop peu de sources
 * de protéines, plafonds de portion atteints) : le solveur fait au mieux et reste en
 * dessous, mieux vaut le dire que laisser croire à un plan sur cible.
 */
export function CoveragePanel() {
  const foods = useFoodsStore((s) => s.foods);
  const byId = useFoodsStore((s) => s.byId);
  const settings = useProfileStore((s) => s.settings);
  const profile = useProfileStore((s) => s.profile);
  const setSelectedFoods = useProfileStore((s) => s.setSelectedFoods);
  const toast = useUIStore((s) => s.toast);

  const allowed = useMemo(
    () => usableFoodIds(settings?.selectedFoodIds, settings?.excludedTags, foods),
    [settings?.selectedFoodIds, settings?.excludedTags, foods]
  );

  // On ne suggère jamais un aliment que l'utilisateur ne peut pas manger : proposer des
  // sardines à quelqu'un qui a exclu le poisson, c'est lui dire d'ignorer sa contrainte.
  const suggestable = useMemo(
    () => foods.filter((f) => !isExcluded(f, settings?.excludedTags)),
    [foods, settings?.excludedTags]
  );

  const lines = useMemo(
    () => weeklyCoverage(settings?.weeklyTemplates, byId, suggestable, allowed),
    [settings?.weeklyTemplates, byId, suggestable, allowed]
  );

  const gap = useMemo(
    () => planMacroGap(settings?.weeklyTemplates, byId, profile?.targetKcal ?? 0, profile?.targetProteinG ?? 0),
    [settings?.weeklyTemplates, byId, profile?.targetKcal, profile?.targetProteinG]
  );

  const balance = useMemo(
    () => proteinMealBalance(settings?.weeklyTemplates, byId, profile?.weightKg ?? 0),
    [settings?.weeklyTemplates, byId, profile?.weightKg]
  );

  if (!settings || lines.length === 0) return null;

  const missing = lines.filter((l) => !l.ok);
  const shortOnMacros = !!gap && (gap.kcalShort > 0 || gap.proteinShort > 0);
  // Répartition protéique déséquilibrée : au moins un repas principal sous la dose MPS.
  const proteinUneven = !!balance && !balance.ok && balance.mainMealCount > 0;

  const addFood = (id: string, name: string) => {
    haptic('selection');
    const sel = settings.selectedFoodIds;
    void setSelectedFoods(sel ? [...sel, id] : [...foods.map((f) => f.id)]);
    toast(`${name} ajouté à ta diète`, 'success');
  };

  const toSee = missing.length + (shortOnMacros ? 1 : 0) + (proteinUneven ? 1 : 0);
  const badge =
    toSee === 0 ? (
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-success bg-success/10 rounded-full px-2 py-0.5">
        <Check size={10} strokeWidth={3} /> Complète
      </span>
    ) : (
      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-warn bg-warn/10 rounded-full px-2 py-0.5">
        <AlertTriangle size={10} /> {toSee} à voir
      </span>
    );

  return (
    <CollapsibleCard
      title="Ce que ta semaine couvre"
      icon={<ClipboardCheck size={18} />}
      summary="Micronutriments, protéines par repas, cible atteinte"
      headerRight={badge}
    >
      <HelpHint>
        Les calories et les protéines ne disent pas tout : deux plans identiques côté
        macros peuvent être très différents côté micronutriments. Ce bilan regarde ta
        semaine telle qu'elle est construite et signale les sources qui ont disparu.
        C'est un signal d'alerte, pas un calcul d'apports : l'app ne connaît pas les
        teneurs exactes, seulement quels aliments sont de vraies sources.
      </HelpHint>

      {shortOnMacros && gap && (
        <div className="rounded-xl bg-warn/10 border border-warn/30 px-3 py-2.5 text-xs text-warn space-y-1">
          <div className="font-semibold">Ta sélection ne permet pas d'atteindre la cible</div>
          <div className="text-text-muted">
            Le plan sert en moyenne {gap.kcal} kcal et {gap.protein} g de protéines par jour
            {gap.proteinShort > 0 && `, soit ${gap.proteinShort} g de protéines sous ta cible`}.
            Ajoute une source de protéines dans « Mes aliments » (onglet Aliments) : sans ça, les portions
            plafonnent (on ne va pas te faire manger douze œufs) et le plan reste en dessous.
          </div>
        </div>
      )}

      {balance && balance.mainMealCount > 0 && (
        <div
          className={[
            'rounded-xl px-3 py-2.5 border',
            balance.ok ? 'bg-surface-hi border-transparent' : 'bg-warn/10 border-warn/30'
          ].join(' ')}
        >
          <div className="flex items-center gap-2">
            <span
              className={[
                'shrink-0 w-5 h-5 rounded-md flex items-center justify-center',
                balance.ok ? 'bg-success/20 text-success' : 'bg-warn/20 text-warn'
              ].join(' ')}
              aria-hidden
            >
              {balance.ok ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={12} />}
            </span>
            <span className="flex-1 min-w-0 text-sm leading-snug">Répartition des protéines</span>
            <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
              {balance.mainMealsReachingDose}/{balance.mainMealCount} repas
            </span>
          </div>

          <div className="mt-1.5 pl-7 flex flex-wrap gap-1.5">
            {balance.perMeal.filter((m) => m.isMain).map((m) => (
              <span
                key={m.slot}
                className={[
                  'inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 tabular-nums',
                  m.reachesDose ? 'bg-success/10 text-success' : 'bg-warn/10 text-warn'
                ].join(' ')}
              >
                {MEAL_LABEL[m.slot]} {m.avgProteinG} g
              </span>
            ))}
          </div>

          <div className="mt-1.5 pl-7 text-[11px] text-text-muted">
            {balance.ok
              ? `Chaque repas principal atteint ~${balance.doseG} g (≈ 0,4 g/kg), la dose qui maximise la synthèse musculaire. Bien réparti.`
              : `Vise ~${balance.doseG} g de protéines (≈ 0,4 g/kg) par repas principal : mieux vaut répartir la ration que la concentrer sur un seul repas (meilleure synthèse musculaire). Rééquilibre ${balance.underDosed.map((s) => MEAL_LABEL[s].toLowerCase()).join(', ')} vers une source de protéines.`}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {lines.map((l) => {
          const meta = NUTRIENT_META[l.nutrient];
          return (
            <div
              key={l.nutrient}
              className={[
                'rounded-xl px-3 py-2.5 border',
                l.ok ? 'bg-surface-hi border-transparent' : 'bg-warn/10 border-warn/30'
              ].join(' ')}
            >
              <div className="flex items-center gap-2">
                <span
                  className={[
                    'shrink-0 w-5 h-5 rounded-md flex items-center justify-center',
                    l.ok ? 'bg-success/20 text-success' : 'bg-warn/20 text-warn'
                  ].join(' ')}
                  aria-hidden
                >
                  {l.ok ? <Check size={13} strokeWidth={3} /> : <AlertTriangle size={12} />}
                </span>
                <span className="flex-1 min-w-0 text-sm leading-snug">{meta.label}</span>
                <span className="shrink-0 text-[11px] text-text-muted tabular-nums">
                  {l.days}/{l.minDays} j
                </span>
              </div>

              {!l.ok && (
                <div className="mt-1.5 pl-7 space-y-2">
                  <div className="text-[11px] text-text-muted">{meta.why}</div>
                  {l.suggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {l.suggestions.map((f) => (
                        <button
                          key={f.id}
                          onClick={() => addFood(f.id, f.name)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand bg-brand/10 rounded-full px-2.5 py-1 tap active:bg-brand/20"
                        >
                          <Plus size={11} /> {f.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-muted">
                      Les sources sont bien dans ta diète, mais en trop petite quantité ou
                      sur trop peu de jours.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <HelpHint>
        Un aliment ajouté ici entre tout de suite dans ta sélection et le plan se
        reconstruit avec. Pour un micronutriment qu'aucun aliment ne peut couvrir (la B12
        dans une diète 100 % végétale, la vitamine D en hiver), c'est un supplément qu'il
        faut, pas un aliment.
      </HelpHint>
    </CollapsibleCard>
  );
}
