import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { CalendarHeart, Check, ChevronDown } from 'lucide-react';
import type { Meal } from '@/types';
import { mealsRepo } from '@/services/repositories';
import { useWeightStore } from '@/store/weightStore';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useLogStore } from '@/store/logStore';
import { useUIStore } from '@/store/uiStore';
import { estimateMaintenance, refeedGuidance, MAINTENANCE_WINDOW_DAYS } from '@/lib/coach';
import { tdee, proteinTargetG } from '@/lib/nutrition';
import { todayKey } from '@/lib/dates';
import { haptic } from '@/lib/haptic';

/**
 * Carte « Jour de recharge (refeed) » : n'apparaît qu'en sèche et quand un refeed est
 * pertinent (%MG bas/modéré). Donne les macros exactes du jour de recharge — protéines
 * inchangées, lipides bas, glucides ↑ à la maintenance — et permet de les APPLIQUER en un
 * tap au menu du jour (re-scale le plan du jour, se reverte demain). Fréquence conseillée
 * ~1×/semaine (ou /2 sem), idéalement un jour de muscu. Cf. refeedGuidance (Module 4.2)
 * et applyRefeedToday (profileStore). Zéro étape manuelle : cf. [[zero-manual-steps]].
 *
 * Même grammaire visuelle que la carte Séance : une ligne icône · titre · action, puis les
 * 4 chiffres du jour sur une bande ; l'explication longue est repliée derrière « Pourquoi ? ».
 */
export function RefeedCard() {
  const weights = useWeightStore((s) => s.weights);
  const byId = useFoodsStore((s) => s.byId);
  const foodsLen = useFoodsStore((s) => s.foods.length);
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const applyRefeedToday = useProfileStore((s) => s.applyRefeedToday);
  const clearRefeedToday = useProfileStore((s) => s.clearRefeedToday);
  const toast = useUIStore((s) => s.toast);
  const todayMeals = useLogStore((s) => s.meals);

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    mealsRepo.all().then((m) => { if (!cancelled) setAllMeals(m); });
    return () => { cancelled = true; };
  }, [todayMeals, foodsLen]);

  if (!profile || !settings) return null;

  const deficit = settings.deficitKcal ?? 0;
  const est = estimateMaintenance(allMeals, byId, weights, MAINTENANCE_WINDOW_DAYS);
  const maintenanceKcal = est.ok ? est.tdee : Math.round(tdee(profile));
  const currentProteinG = profile.targetProteinG ?? proteinTargetG(profile, deficit);
  const g = refeedGuidance(profile, maintenanceKcal, currentProteinG, deficit);

  // Ne s'affiche que quand un refeed est activement recommandé (sèche + %MG bas/modéré).
  if (!g.recommended || !g.macros) return null;

  const applied = settings.lastRefeedDate === todayKey();
  // Fréquence en version courte pour tenir sous le titre (la longue reste dans « Pourquoi ? »).
  const frequency = g.level === 'low' ? '1 à 2× / semaine' : '1× / 1 à 2 semaines';

  const run = async (fn: () => Promise<void>, msg: string, tone: 'success' | 'info') => {
    setBusy(true);
    try {
      await fn();
      toast(msg, tone);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="!p-4 space-y-3" style={applied ? { backgroundColor: '#EEF5FF', border: '1px solid rgba(0, 96, 223, 0.25)' } : undefined}>
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-2xl p-2.5" style={{ backgroundColor: 'rgba(0, 96, 223, 0.10)', color: '#0060DF' }}>
          {applied ? <Check size={20} strokeWidth={2.5} /> : <CalendarHeart size={20} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">
            {applied ? 'Recharge appliquée' : 'Jour de recharge'}
          </div>
          <div className="text-xs text-text-muted mt-0.5 leading-snug">
            {applied ? 'Maintenance · retour demain' : frequency}
          </div>
        </div>
        {applied ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => { haptic('light'); void run(clearRefeedToday, 'Recharge annulée : retour à ton plan de sèche.', 'info'); }}
            className="shrink-0 h-9 px-3 rounded-xl text-sm font-medium disabled:opacity-40 tap active:opacity-70"
            style={{ backgroundColor: '#FFFFFF', color: '#374151', border: '1px solid rgba(0, 96, 223, 0.25)' }}
          >
            Annuler
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => { haptic('selection'); void run(applyRefeedToday, '🍚 Recharge appliquée : ton menu du jour passe à la maintenance (glucides ↑).', 'success'); }}
            className="shrink-0 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-brand active:bg-brand/80 disabled:opacity-40 tap"
          >
            Appliquer
          </button>
        )}
      </div>

      {/* Les 4 chiffres du jour de recharge, sur une bande discrète */}
      <div className="grid grid-cols-4 rounded-xl py-2 text-center" style={{ backgroundColor: applied ? '#FFFFFF' : '#F4F7FD' }}>
        <Stat value={String(Math.round(g.macros.kcal))} label="kcal" />
        <Stat value={`${g.macros.protein} g`} label="protéines" />
        <Stat value={`${g.macros.carbs} g`} label="glucides ↑" strong />
        <Stat value={`${g.macros.fat} g`} label="lipides ↓" />
      </div>

      <div className="-mt-1">
        <button
          type="button"
          onClick={() => setWhyOpen((o) => !o)}
          aria-expanded={whyOpen}
          className="flex items-center gap-1 text-xs text-text-muted tap"
        >
          Pourquoi ?
          <ChevronDown size={14} className={`transition-transform ${whyOpen ? 'rotate-180' : ''}`} />
        </button>
        {whyOpen && <p className="text-xs text-text-muted leading-relaxed mt-1.5">{g.note}</p>}
      </div>
    </Card>
  );
}

function Stat({ value, label, strong }: { value: string; label: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-semibold tabular-nums leading-tight" style={{ color: strong ? '#0060DF' : '#111827' }}>{value}</div>
      <div className="text-[10px] text-text-muted leading-tight mt-0.5">{label}</div>
    </div>
  );
}
