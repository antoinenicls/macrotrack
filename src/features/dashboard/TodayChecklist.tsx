import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { Scale, CheckCircle2, UtensilsCrossed, ChevronRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { useWeightStore } from '@/store/weightStore';
import { useLogStore } from '@/store/logStore';
import { useProfileStore } from '@/store/profileStore';
import { todayKey } from '@/lib/dates';
import { fmtKg, fmtDelta } from '@/lib/format';
import { trendStats } from '@/lib/trend';
import { getTemplateForDate } from '@/lib/templates';
import { haptic } from '@/lib/haptic';
import { WeighInSheet } from '@/features/weight/WeighInSheet';

/**
 * Les deux actions du jour, en DEUX cartes distinctes (même grammaire que la carte Séance :
 * une ligne icône · texte · action) :
 *  - Pesée du matin : bien visible tant qu'elle manque (fond ambré + pastille qui pulse +
 *    bouton « Peser »), discrète une fois faite (poids + tendance, lien vers Poids).
 *  - Menu du jour : bouton vers l'onglet Repas, avec ce qu'il reste à manger.
 */
export function TodayChecklist() {
  const weights = useWeightStore((s) => s.weights);
  const meals = useLogStore((s) => s.meals);
  const settings = useProfileStore((s) => s.settings);
  const [weighOpen, setWeighOpen] = useState(false);

  const today = todayKey();
  const todayWeight = weights.find((w) => w.date === today);
  const stats = trendStats(weights);

  // Progression du menu — template du jour (rotation hebdo prise en compte)
  const todayTemplate = settings ? getTemplateForDate(today, settings) : [];
  const planTotal = todayTemplate.reduce((a, m) => a + m.items.length, 0);
  const planDone = meals.reduce((acc, m) => acc + m.items.filter((it) => it.fromTemplate).length, 0);
  // Exclut les aliments "remplacés" par un repas extérieur (slot avec estimation, non coché).
  const estimateSlots = new Set(meals.filter((m) => m.items.some((it) => it.estimate)).map((m) => m.slot));
  let replacedCount = 0;
  for (const tpl of todayTemplate) {
    if (!estimateSlots.has(tpl.slot)) continue;
    const meal = meals.find((m) => m.slot === tpl.slot);
    for (const pi of tpl.items) {
      const checked = !!meal?.items.some((it) => it.fromTemplate && it.foodId === pi.foodId);
      if (!checked) replacedCount++;
    }
  }
  const effectivePlanTotal = Math.max(0, planTotal - replacedCount);
  const planLeft = Math.max(0, effectivePlanTotal - planDone);
  const planComplete = effectivePlanTotal > 0 && planLeft === 0;

  const w = stats.weeklyKgPerWeek;
  const TrendIcon = w == null ? Minus : w < -0.05 ? TrendingDown : w > 0.05 ? TrendingUp : Minus;

  return (
    <>
      {/* —— Pesée du matin —— */}
      {todayWeight ? (
        <Link to="/weight" className="block tap active:opacity-80">
          <Card className="!p-4">
            <div className="flex items-center gap-3">
              <span className="shrink-0 rounded-2xl p-2.5" style={{ backgroundColor: 'rgba(22, 163, 74, 0.10)', color: '#16A34A' }}>
                <CheckCircle2 size={20} strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-tight">Pesée faite</div>
                {/* Poids + tendance seulement : le %MG reste dans l'onglet Poids (ligne courte, jamais coupée). */}
                <div className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
                  <span>{fmtKg(todayWeight.kg)}</span>
                  {w != null && (
                    <>
                      <span>·</span>
                      <TrendIcon size={12} className="shrink-0" />
                      <span>{fmtDelta(w)}/sem</span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-text-muted" />
            </div>
          </Card>
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => { haptic('selection'); setWeighOpen(true); }}
          className="block w-full text-left tap active:opacity-80"
        >
          <Card className="!p-4" style={{ backgroundColor: '#FFF7ED', border: '1px solid rgba(245, 158, 11, 0.45)' }}>
            <div className="flex items-center gap-3">
              <span className="relative shrink-0 rounded-2xl p-2.5" style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#B45309' }}>
                <Scale size={20} />
                {/* Pastille « à faire » qui pulse : le geste du matin ne doit pas passer inaperçu. */}
                <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping" style={{ backgroundColor: '#F59E0B' }} />
                  <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-white" style={{ backgroundColor: '#F59E0B' }} />
                </span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold leading-tight">Pesée du matin</div>
                <div className="text-xs mt-0.5 font-medium" style={{ color: '#B45309' }}>À faire, à jeun</div>
              </div>
              <span className="shrink-0 h-9 px-4 inline-flex items-center rounded-xl text-sm font-semibold text-white" style={{ backgroundColor: '#F59E0B' }}>
                Peser
              </span>
            </div>
          </Card>
        </button>
      )}

      {/* —— Menu du jour : bouton vers Repas —— */}
      <Link to="/log" className="block tap active:opacity-80">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="shrink-0 rounded-2xl p-2.5" style={{ backgroundColor: 'rgba(0, 96, 223, 0.10)', color: '#0060DF' }}>
              {planComplete ? <CheckCircle2 size={20} strokeWidth={2.25} /> : <UtensilsCrossed size={20} />}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold leading-tight">Menu du jour</div>
              <div className="text-xs text-text-muted mt-0.5">
                {effectivePlanTotal === 0
                  ? 'Voir mes repas'
                  : planComplete
                  ? 'Tout est coché 👍'
                  : `${planLeft} aliment${planLeft > 1 ? 's' : ''} à manger`}
              </div>
            </div>
            {effectivePlanTotal > 0 && (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-text-muted">{planDone}/{effectivePlanTotal}</span>
            )}
            <ChevronRight size={18} className="shrink-0 text-text-muted" />
          </div>
        </Card>
      </Link>

      <WeighInSheet open={weighOpen} onClose={() => setWeighOpen(false)} date={today} />
    </>
  );
}
