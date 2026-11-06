import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui';
import type { Meal } from '@/types';
import { mealsRepo } from '@/services/repositories';
import { useProfileStore } from '@/store/profileStore';
import { useWeightStore } from '@/store/weightStore';
import { useFoodsStore } from '@/store/foodsStore';
import { fmtKcal } from '@/lib/format';
import { haptic } from '@/lib/haptic';
import { GROUPS, buildGuide, computeGuideContext, type GroupId } from './guideSections';
import { FOCUS_RING, GuideSection, Stat, normalize } from './guideUi';
import { FeedbackCard } from '@/features/feedback/FeedbackCard';

type Filter = GroupId | 'all';

/** Thème et sections ouvertes, gardés le temps de la session (on revient où on était). */
let lastFilter: Filter = 'all';
let lastOpen = new Set<string>(['bienvenue']);

/**
 * Onglet « Explications » : le guide de l'app et la transparence sur chaque calcul, avec
 * les vrais chiffres de l'utilisateur.
 *
 * Pour retrouver une info vite :
 *  - une barre de recherche (sans accents, sur les titres, résumés et mots-clés) ;
 *  - des thèmes (Démarrer, Au quotidien, Plan & aliments, Calories, Coach, Phases &
 *    sécurité, Lexique) ;
 *  - chaque section affiche un résumé d'une ligne, visible repliée.
 * Le contenu vit dans guideSections, la mise en forme dans guideUi.
 */
export function ExplanationsPage() {
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const weights = useWeightStore((s) => s.weights);
  const byId = useFoodsStore((s) => s.byId);
  const foodsLen = useFoodsStore((s) => s.foods.length);

  const [allMeals, setAllMeals] = useState<Meal[]>([]);
  useEffect(() => {
    let cancelled = false;
    mealsRepo.all().then((m) => { if (!cancelled) setAllMeals(m); });
    return () => { cancelled = true; };
  }, [foodsLen]);

  const [query, setQuery] = useState('');
  const [filter, setFilterState] = useState<Filter>(lastFilter);
  const [open, setOpenState] = useState<Set<string>>(lastOpen);

  const setFilter = (f: Filter) => { lastFilter = f; setFilterState(f); };
  const setOpen = (next: Set<string>) => { lastOpen = next; setOpenState(next); };

  const ctx = useMemo(
    () => (profile && settings ? computeGuideContext(profile, settings, weights, allMeals, byId) : null),
    [profile, settings, weights, allMeals, byId]
  );
  const guide = useMemo(() => (ctx ? buildGuide(ctx) : []), [ctx]);

  const q = normalize(query.trim());
  const searching = q.length > 0;

  // Recherche : chaque mot tapé doit apparaître (titre, résumé, mots-clés ou thème).
  const visible = useMemo(() => {
    if (searching) {
      const words = q.split(/\s+/);
      return guide.filter((s) => {
        const hay = normalize(`${s.title} ${s.summary} ${s.keywords} ${GROUPS.find((g) => g.id === s.group)!.label}`);
        return words.every((w) => hay.includes(w));
      });
    }
    return filter === 'all' ? guide : guide.filter((s) => s.group === filter);
  }, [guide, q, searching, filter]);

  // Peu de résultats : on les ouvre directement, c'est sûrement ce qu'on cherche.
  useEffect(() => {
    if (searching && visible.length > 0 && visible.length <= 2) {
      setOpen(new Set([...open, ...visible.map((s) => s.id)]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  if (!profile || !settings || !ctx) {
    return (
      <div className="px-5 pb-5">
        <PageHeader title="Explications" subtitle="Guide & calculs" />
      </div>
    );
  }

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) next.delete(id); else next.add(id);
    setOpen(next);
  };
  const allVisibleOpen = visible.length > 0 && visible.every((s) => open.has(s.id));
  const toggleAll = () => {
    haptic('light');
    const next = new Set(open);
    for (const s of visible) { if (allVisibleOpen) next.delete(s.id); else next.add(s.id); }
    setOpen(next);
  };

  // Regroupement par thème, dans l'ordre des thèmes.
  const groups = GROUPS
    .map((g) => ({ ...g, items: visible.filter((s) => s.group === g.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4 px-5 pb-5">
      <PageHeader title="Explications" subtitle="Guide & calculs" />

      {/* Recherche */}
      <div role="search" className="space-y-3">
        <label htmlFor="guide-search" className="sr-only">Rechercher dans les explications</label>
        <div className="relative">
          <Search size={18} aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            id="guide-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher : séance, resto, protéines…"
            className={`w-full h-12 pl-11 pr-12 rounded-2xl bg-surface border border-border text-[16px] text-text placeholder:text-text-muted [&::-webkit-search-cancel-button]:appearance-none ${FOCUS_RING}`}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label="Effacer la recherche"
              className={`absolute right-1 top-1/2 -translate-y-1/2 tap flex items-center justify-center rounded-xl text-text-muted ${FOCUS_RING}`}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Thèmes (masqués pendant une recherche : elle porte sur tout le guide) */}
        {!searching && (
          <div role="group" aria-label="Filtrer par thème" className="flex flex-wrap gap-2">
            {[{ id: 'all' as const, short: 'Tout', icon: null }, ...GROUPS].map((g) => {
              const active = filter === g.id;
              const Icon = g.icon;
              return (
                <button
                  key={g.id}
                  onClick={() => { if (!active) haptic('selection'); setFilter(g.id); }}
                  aria-pressed={active}
                  className={[
                    'h-10 px-3.5 rounded-full text-[14px] font-semibold inline-flex items-center gap-1.5 transition-colors',
                    active ? 'bg-brand text-white' : 'bg-surface-hi text-text border border-border active:bg-surface',
                    FOCUS_RING
                  ].join(' ')}
                >
                  {Icon && <Icon size={15} aria-hidden />}
                  {g.short}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Chiffres clés — seulement dans la vue d'ensemble ou le thème Calories */}
      {!searching && (filter === 'all' || filter === 'calories') && (
        <Card className="space-y-3 !p-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">Tes chiffres en direct</h2>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Au repos" value={fmtKcal(ctx.restingBmr)} />
            <Stat label="Maintenance" value={fmtKcal(ctx.maintenance)} />
            <Stat label="Cible" value={fmtKcal(profile.targetKcal ?? ctx.targets.kcal)} accent />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Protéines" value={`${ctx.macros.protein} g`} />
            <Stat label="Lipides" value={`${ctx.macros.fat} g`} />
            <Stat label="Glucides" value={`${ctx.macros.carbs} g`} />
          </div>
          <p className="text-[13px] text-text-muted leading-relaxed">
            {ctx.paused
              ? 'Pause diète active : cible tenue à ta maintenance.'
              : ctx.isBulk
              ? `Prise de masse · surplus ${-ctx.deficit} kcal/j.`
              : ctx.deficit > 0
              ? `Sèche · déficit ${ctx.deficit} kcal/j.`
              : 'Maintien.'}
            {' '}{settings.adaptiveTargets ? 'Ajustement automatique activé.' : 'Ajustement automatique désactivé.'}
          </p>
        </Card>
      )}

      {/* Nombre de résultats + tout déplier / replier */}
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-[13px] text-text-muted" aria-live="polite">
          {searching
            ? visible.length === 0
              ? 'Aucun résultat'
              : `${visible.length} résultat${visible.length > 1 ? 's' : ''}`
            : `${visible.length} sujet${visible.length > 1 ? 's' : ''}`}
        </p>
        {visible.length > 1 && (
          <button onClick={toggleAll} className={`text-[13px] font-semibold text-brand tap px-2 rounded-lg ${FOCUS_RING}`}>
            {allVisibleOpen ? 'Tout replier' : 'Tout déplier'}
          </button>
        )}
      </div>

      {searching && visible.length === 0 && (
        <Card className="!p-4 space-y-2">
          <p className="text-[15px]">Rien ne correspond à « {query.trim()} ».</p>
          <p className="text-[13px] text-text-muted leading-relaxed">
            Essaie un mot plus simple (« courses », « allergie », « pesée »), ou parcours les thèmes.
          </p>
          <button onClick={() => setQuery('')} className={`text-[14px] font-semibold text-brand tap ${FOCUS_RING}`}>
            Voir tous les thèmes
          </button>
        </Card>
      )}

      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`guide-group-${g.id}`} className="space-y-2.5">
          <h2 id={`guide-group-${g.id}`} className="flex items-center gap-2 px-1 pt-1 text-[17px] font-bold">
            <g.icon size={18} aria-hidden className="text-brand shrink-0" />
            {g.label}
          </h2>
          {g.items.map((s) => (
            <GuideSection
              key={s.id}
              id={s.id}
              icon={s.icon}
              title={s.title}
              summary={s.summary}
              open={open.has(s.id)}
              onToggle={() => toggle(s.id)}
            >
              {s.body}
            </GuideSection>
          ))}
        </section>
      ))}

      {!searching && <FeedbackCard />}
    </div>
  );
}
