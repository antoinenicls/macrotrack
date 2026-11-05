import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sheet, SegmentedControl, Card, EmptyState, NumberInput, Button, ProgressBar } from '@/components/ui';
import { ChevronDown, CalendarRange, Check, Package, Minus, Plus, Dumbbell } from 'lucide-react';
import { haptic } from '@/lib/haptic';
import { useProfileStore } from '@/store/profileStore';
import { useFoodsStore } from '@/store/foodsStore';
import { mealsRepo } from '@/services/repositories';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { dayKey, formatHumanDate, addDays, startOfWeek, todayKey } from '@/lib/dates';
import type { Food, MealSlot } from '@/types';
import { MEAL_LABEL, MEAL_SLOTS } from '@/types';
import { macrosForItem, sumMacros, toNativeGrams } from '@/lib/nutrition';
import { fmtG, fmtKcal, describeServing, rawEquivLabel } from '@/lib/format';
import { getTemplateForDate } from '@/lib/templates';
import { applyCarryOver, carryOverFor, carrySettingsOf, planKcal } from '@/lib/estimateRebalance';
import { aisleForFood, AISLE_LABEL, AISLE_ORDER, type Aisle } from '@/lib/aisles';
import { toBuyGrams, isFullyStocked } from '@/lib/pantry';
import { isTrainingDay, pendingTrainingItems, DEFAULT_SESSIONS_PER_WEEK } from '@/lib/trainingDay';
import { isDiscrete } from '@/lib/portions';

interface Props {
  open: boolean;
  onClose: () => void;
}

type WeekKind = 'this' | 'next';

interface DayPlan {
  date: string;
  meals: Array<{ slot: MealSlot; items: Array<{ foodId: string; grams: number; cooked: boolean }> }>;
  /** "logged" si les meals viennent de la DB (jour passé/présent loggé), "planned" sinon. */
  source: 'logged' | 'planned';
}

/** Aggrège les besoins de la semaine par aliment, en équivalent natif (raw généralement). */
interface AggregateLine {
  food: Food;
  nativeGrams: number;
  /** Nombre de jours où l'aliment apparaît. */
  days: number;
}

/** Icône de rayon : repère visuel immédiat en magasin. */
const AISLE_EMOJI: Record<Aisle, string> = {
  'produce': '🥦',
  'boucherie': '🥩',
  'conserves': '🥫',
  'cremerie': '🥛',
  'epicerie-salee': '🍚',
  'gouter': '🍫',
  'complements': '💪'
};

/** Poids d'achat lisible : « 650 g », « 1,2 kg ». */
function fmtBuy(grams: number): string {
  if (grams >= 1000) return `${(Math.round(grams / 100) / 10).toString().replace('.', ',')} kg`;
  return `${Math.round(grams)} g`;
}

export function WeekView({ open, onClose }: Props) {
  const settings = useProfileStore((s) => s.settings);
  const profile = useProfileStore((s) => s.profile);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const byId = useFoodsStore((s) => s.byId);
  const [week, setWeek] = useState<WeekKind>('this');
  const [days, setDays] = useState<DayPlan[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Checklist de courses : ids cochés, persistés par semaine (survit à une fermeture en magasin)
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Validation visuelle courte : ids en cours d'animation "coche" avant bascule au panier.
  const [pending, setPending] = useState<Set<string>>(new Set());
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Sections repliables du bas de liste (panier / stock) : repliées par défaut, la liste
  // ne montre d'emblée que ce qu'il reste à prendre.
  const [cartOpen, setCartOpen] = useState(false);
  const [stockListOpen, setStockListOpen] = useState(false);
  // Garde-manger : édition INLINE du stock (ce qu'on possède déjà).
  // Inline plutôt qu'une sheet imbriquée : pas de conflit clavier/positionnement sur iOS,
  // la zone scrollable de la sheet plein écran gère déjà l'inset du clavier.
  const setPantryStock = useProfileStore((s) => s.setPantryStock);
  const [openStockId, setOpenStockId] = useState<string | null>(null);
  const [stockDraft, setStockDraft] = useState<number | ''>('');

  const toggleStock = (food: Food) => {
    haptic('light');
    setOpenStockId((prev) => {
      const next = prev === food.id ? null : food.id;
      if (next) setStockDraft(settings?.pantry?.[food.id] ?? '');
      return next;
    });
  };
  // Applique en direct : la liste reflète le stock immédiatement (pas de bouton "Enregistrer").
  const applyStock = (foodId: string, grams: number | '') => {
    setStockDraft(grams);
    void setPantryStock(foodId, grams === '' ? 0 : grams);
  };

  // Le week-end, on fait les courses pour la semaine à venir : on avance donc l'ancre
  // d'une semaine pour que l'onglet "Cette semaine" pointe sur la semaine qu'on prépare.
  const anchorMonday = useMemo(() => {
    const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
    const dow = new Date().getDay(); // 0 = dimanche, 6 = samedi
    const isWeekend = dow === 0 || dow === 6;
    return isWeekend ? addDays(monday, 7) : monday;
  }, []);

  // 7 dates (lundi → dimanche) de la semaine affichée
  const dates = useMemo(() => {
    const start = week === 'this' ? anchorMonday : addDays(anchorMonday, 7);
    return Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)));
  }, [week, anchorMonday]);

  // Plages de dates affichées sous les onglets (ex : "2 juin – 8 juin")
  const ranges = useMemo(() => {
    const fmt = (d: Date) => format(d, 'd MMM', { locale: fr });
    const nextStart = addDays(anchorMonday, 7);
    return {
      this: `${fmt(anchorMonday)} – ${fmt(addDays(anchorMonday, 6))}`,
      next: `${fmt(nextStart)} – ${fmt(addDays(nextStart, 6))}`
    };
  }, [anchorMonday]);

  // Les courses ne se cochent que pour la semaine active (celle qu'on prépare),
  // pas pour la semaine d'après dont on ne fait pas encore les courses.
  const isShoppingWeek = week === 'this';
  const storageKey = `mt-courses-checked-${dates[0]}`; // clé par vraie semaine → reset auto

  useEffect(() => {
    if (!open || !isShoppingWeek) { setChecked(new Set()); return; }
    try {
      const raw = localStorage.getItem(storageKey);
      setChecked(raw ? new Set<string>(JSON.parse(raw)) : new Set());
    } catch {
      setChecked(new Set());
    }
  }, [open, storageKey, isShoppingWeek]);

  // Sécurité : à la fermeture (ou au démontage), on purge les timers de validation
  // en cours pour éviter un setState après coup et toute fuite.
  useEffect(() => {
    if (!open) {
      for (const t of pendingTimers.current.values()) clearTimeout(t);
      pendingTimers.current.clear();
      setPending(new Set());
    }
    return () => {
      for (const t of pendingTimers.current.values()) clearTimeout(t);
      pendingTimers.current.clear();
    };
  }, [open]);

  const persistChecked = (set: Set<string>) => {
    try { localStorage.setItem(storageKey, JSON.stringify([...set])); } catch { /* quota / private mode */ }
  };

  const clearPending = (foodId: string) => {
    const t = pendingTimers.current.get(foodId);
    if (t) { clearTimeout(t); pendingTimers.current.delete(foodId); }
    setPending((p) => { if (!p.has(foodId)) return p; const n = new Set(p); n.delete(foodId); return n; });
  };

  const toggleChecked = (foodId: string) => {
    // Déjà dans le panier → on décoche tout de suite (retour au rayon).
    if (checked.has(foodId)) {
      haptic('selection');
      setChecked((prev) => { const next = new Set(prev); next.delete(foodId); persistChecked(next); return next; });
      return;
    }
    // Validation déjà en cours → un 2e tap annule.
    if (pendingTimers.current.has(foodId)) { clearPending(foodId); return; }

    // Sinon : court indicateur dans la case (~200 ms), puis bascule dans le panier.
    haptic('selection');
    setPending((p) => new Set(p).add(foodId));
    const timer = setTimeout(() => {
      pendingTimers.current.delete(foodId);
      setPending((p) => { const n = new Set(p); n.delete(foodId); return n; });
      setChecked((prev) => { const next = new Set(prev).add(foodId); persistChecked(next); return next; });
      haptic('light');
    }, 200);
    pendingTimers.current.set(foodId, timer);
  };

  const resetChecked = () => {
    haptic('selection');
    // Annule toute validation en cours avant de tout vider.
    for (const t of pendingTimers.current.values()) clearTimeout(t);
    pendingTimers.current.clear();
    setPending(new Set());
    setChecked(new Set());
    try { localStorage.removeItem(storageKey); } catch { /* noop */ }
  };

  // Charge les meals réels et fusionne avec le plan type pour les jours futurs ou vides
  useEffect(() => {
    if (!open || !settings) return;
    let cancelled = false;
    (async () => {
      const today = todayKey();
      const result: DayPlan[] = [];
      for (const d of dates) {
        const isPastOrToday = d <= today;
        if (isPastOrToday) {
          const meals = await mealsRepo.byDate(d);
          if (meals.length > 0 && meals.some((m) => m.items.length > 0)) {
            result.push({ date: d, meals: meals.map((m) => ({ slot: m.slot, items: m.items })), source: 'logged' });
            continue;
          }
        }
        // Sinon plan type — choisit le template du jour (rotation hebdo si configurée), allégé
        // d'un éventuel report de repas estimé des jours précédents.
        const tpl = getTemplateForDate(d, settings);
        const tplForDay = applyCarryOver(tpl, carryOverFor(d, settings.estimateSurplus, planKcal(tpl, byId), carrySettingsOf(settings)), byId);
        result.push({
          date: d,
          meals: tplForDay.map((t) => ({ slot: t.slot, items: t.items })),
          source: 'planned'
        });
      }
      if (!cancelled) setDays(result);
    })();
    return () => { cancelled = true; };
  }, [open, dates, settings, byId]);

  // Séances de la semaine : celles déjà présentes dans un jour (faites ou déclarées) sont
  // comptées par leurs aliments ; les autres sont ajoutées à la liste (bloc pré-training).
  const sessionsPerWeek = settings?.trainingSessionsPerWeek ?? DEFAULT_SESSIONS_PER_WEEK;
  const sessionsCounted = days.filter((d) => isTrainingDay(d.meals)).length;
  const setSessionsPerWeek = (n: number) => {
    if (!settings) return;
    haptic('selection');
    void saveSettings({ ...settings, trainingSessionsPerWeek: Math.max(0, Math.min(7, n)) });
  };

  // Agrégat : pour chaque foodId, somme les grammes en équivalent natif (cru/sec)
  const aggregate = useMemo<AggregateLine[]>(() => {
    const map = new Map<string, AggregateLine>();
    const add = (it: { foodId: string; grams: number; cooked: boolean }, seen: Set<string>, dayCount: number) => {
      const food = byId(it.foodId);
      if (!food) return;
      const native = toNativeGrams(food, it.grams, it.cooked);
      const existing = map.get(it.foodId);
      if (existing) {
        existing.nativeGrams += native;
        if (!seen.has(it.foodId)) { existing.days += dayCount; seen.add(it.foodId); }
      } else {
        map.set(it.foodId, { food, nativeGrams: native, days: dayCount });
        seen.add(it.foodId);
      }
    };
    for (const day of days) {
      const seenToday = new Set<string>();
      for (const meal of day.meals) for (const it of meal.items) add(it, seenToday, 1);
    }
    const extra = pendingTrainingItems(sessionsPerWeek, sessionsCounted);
    const left = Math.max(0, sessionsPerWeek - sessionsCounted);
    const seenExtra = new Set<string>();
    for (const it of extra) add(it, seenExtra, left);
    return Array.from(map.values());
  }, [days, byId, sessionsPerWeek, sessionsCounted]);

  // Regroupe la liste de courses par rayon (ordre de parcours en magasin)
  const groupedAggregate = useMemo(() => {
    const map = new Map<Aisle, AggregateLine[]>();
    for (const line of aggregate) {
      const aisle = aisleForFood(line.food);
      const arr = map.get(aisle);
      if (arr) arr.push(line); else map.set(aisle, [line]);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.food.name.localeCompare(b.food.name, 'fr'));
    }
    return AISLE_ORDER.filter((a) => map.has(a)).map((a) => ({ aisle: a, lines: map.get(a)! }));
  }, [aggregate]);

  // Total calories pour info
  const weekTotals = useMemo(() => {
    return days.map((day) => {
      const allItems = day.meals.flatMap((m) => m.items);
      const totals = sumMacros(allItems.map((it) => {
        const food = byId(it.foodId);
        return macrosForItem(food, { foodId: it.foodId, grams: it.grams, cooked: it.cooked });
      }));
      return { date: day.date, totals, source: day.source, meals: day.meals };
    });
  }, [days, byId]);

  const today = todayKey();

  /** État d'une ligne de courses : besoin, stock, et si elle est "réglée" (prise ou déjà en stock). */
  interface LineStatus {
    need: number;
    stock: number;
    toBuy: number;
    fullyStocked: boolean;
    isChecked: boolean;
    /** "réglée" : soit cochée (dans le panier), soit déjà couverte par le stock. */
    done: boolean;
  }
  const getStatus = (line: AggregateLine): LineStatus => {
    const need = Math.round(line.nativeGrams);
    const stock = isShoppingWeek ? (settings?.pantry?.[line.food.id] ?? 0) : 0;
    const toBuy = toBuyGrams(need, stock);
    const fullyStocked = isShoppingWeek && isFullyStocked(need, stock);
    const isChecked = isShoppingWeek && checked.has(line.food.id);
    return { need, stock, toBuy, fullyStocked, isChecked, done: isChecked || fullyStocked };
  };

  /**
   * Une ligne de courses : toute la ligne se touche pour cocher (grande cible, une main en
   * magasin). Quantité d'ACHAT en avant (« 2 boîtes », « 1,2 kg »), le détail en petit.
   */
  const renderLine = (line: AggregateLine, st: LineStatus) => {
    const { need, stock, toBuy, fullyStocked, isChecked, done } = st;
    const serving = line.food.commonServings?.[0];
    const grams = isShoppingWeek && !fullyStocked ? toBuy : need;
    // En pièces seulement pour ce qui s'achète à la pièce (œufs, bananes, boîtes, galettes) ;
    // le reste au poids (« 35 pots de fromage blanc » n'aiderait personne).
    // Forme courte (« 9 bananes », « 2 boîtes ») : les qualificatifs de portion
    // (« moyennes », « égouttées ») n'aident pas en rayon et écrasent le nom de l'article.
    const pieces = serving && isDiscrete(line.food)
      ? describeServing(grams, serving)?.replace(/\s+(moyen(ne)?s?|égouttée?s?)$/, '') ?? null
      : null;
    const primary = fullyStocked ? 'en stock' : pieces ?? fmtBuy(grams);
    const secondary = fullyStocked
      ? `${fmtBuy(stock)} à la maison`
      : [pieces ? fmtBuy(grams) : null, isShoppingWeek && stock > 0 ? `${fmtBuy(stock)} déjà là` : null]
          .filter(Boolean).join(' · ');

    const isPending = isShoppingWeek && pending.has(line.food.id);
    const box = isPending || isChecked ? (
      <span className={`shrink-0 grid place-items-center w-6 h-6 rounded-full bg-brand ${isPending ? 'animate-check-pop' : ''}`}>
        <Check size={14} strokeWidth={3} className="text-white" />
      </span>
    ) : fullyStocked ? (
      <span className="shrink-0 grid place-items-center w-6 h-6 rounded-full bg-brand/10">
        <Check size={14} strokeWidth={3} className="text-brand" />
      </span>
    ) : (
      <span className="shrink-0 w-6 h-6 rounded-full border-2" style={{ borderColor: '#C9D3E6' }} />
    );

    const text = (
      <div className="min-w-0 flex-1">
        <div className={`text-[15px] leading-tight ${done ? 'text-text-muted line-through decoration-text-muted/50' : 'font-medium text-text'}`}>
          {line.food.name}
        </div>
        {secondary && <div className="text-xs text-text-muted mt-0.5">{secondary}</div>}
      </div>
    );
    const qty = (
      <span className={`shrink-0 text-sm tabular-nums text-right ${done ? 'text-text-muted' : 'font-semibold text-text'}`}>
        {primary}
      </span>
    );

    // Semaine prochaine : simple aperçu, rien à cocher.
    if (!isShoppingWeek) {
      return (
        <li key={line.food.id} className="flex items-center gap-3 px-4 py-3">
          {text}
          {qty}
        </li>
      );
    }

    const stockOpen = openStockId === line.food.id;
    return (
      // Pas de framer-motion `layout` ici : combiné à l'AnimatePresence du Sheet,
      // il laissait le backdrop bloqué (clics interceptés) à la fermeture après avoir
      // coché des articles.
      <li key={line.food.id}>
        <div className="flex items-center">
          <button
            onClick={() => toggleChecked(line.food.id)}
            className="flex items-center gap-3 flex-1 min-w-0 text-left pl-4 pr-2 py-3 tap active:bg-surface-hi transition-colors"
          >
            {box}
            {text}
            {qty}
          </button>
          {/* Stock « déjà à la maison » : action secondaire, discrète */}
          <button
            onClick={() => toggleStock(line.food)}
            aria-label={`Ce que j'ai déjà de ${line.food.name}`}
            aria-expanded={stockOpen}
            className={`shrink-0 w-10 h-12 grid place-items-center tap ${stockOpen || stock > 0 ? 'text-brand' : 'text-text-muted/50'}`}
          >
            <Package size={16} />
          </button>
        </div>

        {/* Éditeur de stock inline (pas de sheet imbriquée → fiable sur iPhone) */}
        {stockOpen && (
          <div className="px-4 pb-3 space-y-2">
            <NumberInput
              value={stockDraft}
              onChange={(v) => applyStock(line.food.id, v)}
              suffix="g"
              min={0}
              placeholder="0"
              hint={`Ce que tu as déjà à la maison · besoin de la semaine : ${fmtBuy(need)}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              {serving && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => applyStock(line.food.id, (stockDraft === '' ? 0 : stockDraft) + serving.grams)}
                >
                  +1 {serving.label.replace(/^1\s*/, '')}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => applyStock(line.food.id, need)}>J'ai tout</Button>
              <Button variant="secondary" size="sm" onClick={() => applyStock(line.food.id, '')}>Vider</Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setOpenStockId(null)}>Fermer</Button>
            </div>
          </div>
        )}
      </li>
    );
  };

  /** Liste d'articles dans une carte blanche, lignes séparées par un filet. */
  const listCard = (lines: AggregateLine[]) => (
    <Card className="!p-0 overflow-hidden">
      <ul className="divide-y divide-[#EEF2F8]">
        {lines.map((line) => renderLine(line, getStatus(line)))}
      </ul>
    </Card>
  );

  /** Bloc rayon : petit en-tête (icône + nom + nombre) puis sa carte d'articles. */
  const renderAisle = (aisle: Aisle, lines: AggregateLine[]) => (
    <section key={aisle} className="space-y-1.5">
      <h4 className="flex items-center gap-2 px-1 text-xs font-semibold text-text-muted">
        <span className="text-base leading-none">{AISLE_EMOJI[aisle]}</span>
        {AISLE_LABEL[aisle]}
        <span className="ml-auto tabular-nums font-medium">{lines.length}</span>
      </h4>
      {listCard(lines)}
    </section>
  );

  /** Section repliable du bas (panier / déjà en stock). */
  const renderFolded = (label: string, lines: AggregateLine[], isOpen: boolean, toggle: () => void) => (
    <section className="space-y-1.5">
      <button
        type="button"
        onClick={() => { haptic('light'); toggle(); }}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-2 px-1 text-xs font-semibold text-text-muted tap"
      >
        {label}
        <span className="tabular-nums font-medium">{lines.length}</span>
        <ChevronDown size={14} className={`ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && listCard(lines)}
    </section>
  );

  if (!profile || !settings) return null;

  // Mode courses : ce qu'il reste à prendre (par rayon), puis, repliés en bas, le panier
  // (coché) et ce qui est déjà à la maison (couvert par le garde-manger).
  const buyGroups = groupedAggregate
    .map((g) => ({ aisle: g.aisle, lines: g.lines.filter((l) => !getStatus(l).done) }))
    .filter((g) => g.lines.length > 0);
  const flatOrdered = groupedAggregate.flatMap((g) => g.lines); // ordre rayon, nom trié
  const inCart = flatOrdered.filter((l) => getStatus(l).isChecked);
  const inStock = flatOrdered.filter((l) => {
    const s = getStatus(l);
    return s.fullyStocked && !s.isChecked;
  });
  const total = aggregate.length;
  const leftCount = aggregate.filter((l) => !getStatus(l).done).length;
  const doneCount = total - leftCount;

  return (
    <Sheet open={open} onClose={onClose} title="Liste de courses" fullScreen>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <SegmentedControl<WeekKind>
            value={week}
            onChange={(v) => setWeek(v)}
            options={[
              { value: 'this', label: 'Cette semaine' },
              { value: 'next', label: 'Semaine prochaine' }
            ]}
          />
          {/* Plages de dates alignées sous les deux onglets */}
          <div className="flex px-1">
            <div className={`flex-1 text-center text-[11px] font-medium capitalize ${week === 'this' ? 'text-brand' : 'text-text-muted'}`}>
              {ranges.this}
            </div>
            <div className={`flex-1 text-center text-[11px] font-medium capitalize ${week === 'next' ? 'text-brand' : 'text-text-muted'}`}>
              {ranges.next}
            </div>
          </div>
        </div>

        {/* Résumé : ce qu'il reste à prendre + progression */}
        {total > 0 && (
          <Card className="!p-4 space-y-3">
            {isShoppingWeek ? (
              <>
                <div className="flex items-end justify-between gap-3">
                  {leftCount > 0 ? (
                    <div className="leading-none">
                      <span className="text-3xl font-extrabold tabular-nums text-text">{leftCount}</span>
                      <span className="text-sm font-medium text-text-muted ml-1.5">à prendre</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 text-base font-bold text-brand">
                      <span className="grid place-items-center w-5 h-5 rounded-full bg-brand">
                        <Check size={13} strokeWidth={3} className="text-white" />
                      </span>
                      Tout est pris
                    </div>
                  )}
                  <span className="text-xs text-text-muted tabular-nums">{doneCount}/{total}</span>
                </div>
                <ProgressBar value={doneCount} max={total} color="rgb(var(--c-brand))" height={6} />
              </>
            ) : (
              <p className="text-sm text-text-muted">Aperçu · {total} articles pour la semaine du {ranges.next}.</p>
            )}

            {/* Séances prévues : fait entrer galettes / miel / banane dans la liste */}
            <div className="flex items-center gap-3 pt-1">
              <Dumbbell size={16} className="shrink-0 text-brand" />
              <div className="flex-1 min-w-0 text-xs text-text-muted leading-snug">
                <span className="font-semibold text-text">Séances prévues</span>
                <br />galettes, miel, banane
              </div>
              <div className="shrink-0 flex items-center gap-1 rounded-xl p-1" style={{ backgroundColor: '#F4F7FD' }}>
                <button
                  type="button"
                  aria-label="Une séance de moins"
                  onClick={() => setSessionsPerWeek(sessionsPerWeek - 1)}
                  disabled={sessionsPerWeek <= 0}
                  className="w-8 h-8 grid place-items-center rounded-lg tap active:bg-white disabled:opacity-30"
                >
                  <Minus size={15} />
                </button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{sessionsPerWeek}</span>
                <button
                  type="button"
                  aria-label="Une séance de plus"
                  onClick={() => setSessionsPerWeek(sessionsPerWeek + 1)}
                  disabled={sessionsPerWeek >= 7}
                  className="w-8 h-8 grid place-items-center rounded-lg tap active:bg-white disabled:opacity-30"
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          </Card>
        )}

        {aggregate.length === 0 ? (
          <EmptyState title="Aucun aliment planifié" description="Configure ton plan type dans Plan & Profil." />
        ) : !isShoppingWeek ? (
          <div className="space-y-4">
            {groupedAggregate.map(({ aisle, lines }) => renderAisle(aisle, lines))}
          </div>
        ) : (
          <div className="space-y-4">
            {buyGroups.length > 0 ? (
              buyGroups.map(({ aisle, lines }) => renderAisle(aisle, lines))
            ) : (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-text-muted">
                <Check size={16} strokeWidth={3} className="text-brand" />
                Rien d'autre à prendre.
              </div>
            )}

            {inCart.length > 0 && renderFolded('Dans le panier', inCart, cartOpen, () => setCartOpen((o) => !o))}
            {inStock.length > 0 && renderFolded('Déjà à la maison', inStock, stockListOpen, () => setStockListOpen((o) => !o))}

            {inCart.length > 0 && (
              <div className="flex justify-center">
                <button type="button" onClick={resetChecked} className="text-xs text-text-muted underline underline-offset-2 tap">
                  Tout décocher
                </button>
              </div>
            )}
          </div>
        )}

        {/* Jours de la semaine */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center gap-2 px-1">
            <CalendarRange size={16} className="text-text-muted" />
            <h3 className="text-sm uppercase tracking-wide text-text-muted">Détail par jour</h3>
          </div>
          {weekTotals.map((day) => {
            const isToday = day.date === today;
            const isPast = day.date < today;
            const isOpen = expanded === day.date;
            return (
              <Card key={day.date} className={isToday ? 'border-brand/40' : ''}>
                <button
                  onClick={() => setExpanded(isOpen ? null : day.date)}
                  className="w-full flex items-center justify-between text-left tap"
                >
                  <div>
                    <div className="font-semibold capitalize">{formatHumanDate(day.date)}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {fmtKcal(day.totals.kcal)} • P {fmtG(day.totals.protein)} G {fmtG(day.totals.carbs)} L {fmtG(day.totals.fat)}
                      <span className="ml-2 inline-block">
                        {day.source === 'logged'
                          ? <span className="text-success">●&nbsp;loggé</span>
                          : isPast
                            ? <span className="text-warn">●&nbsp;non loggé</span>
                            : <span className="text-text-muted/70">○&nbsp;prévu</span>}
                      </span>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-3">
                        {MEAL_SLOTS.map((slot) => {
                          const meal = day.meals.find((m) => m.slot === slot);
                          if (!meal || meal.items.length === 0) return null;
                          return (
                            <div key={slot}>
                              <div className="text-xs uppercase tracking-wide text-text-muted mb-1">{MEAL_LABEL[slot]}</div>
                              <ul className="space-y-1">
                                {meal.items.map((it, idx) => {
                                  const food = byId(it.foodId);
                                  const serving = food?.commonServings?.[0];
                                  const equiv = serving ? describeServing(it.grams, serving) : null;
                                  const rawEq = food ? rawEquivLabel(food, it.grams, it.cooked) : null;
                                  return (
                                    <li key={idx} className="flex items-baseline justify-between gap-3 text-sm">
                                      <span className="min-w-0 leading-snug break-words">{food?.name ?? '–'}</span>
                                      <span className="text-text-muted text-xs shrink-0 text-right">
                                        {it.grams}g {it.cooked ? 'cuit' : ''}
                                        {rawEq && <span className="block opacity-80">{rawEq}</span>}
                                        {equiv && <span className="block opacity-80">≈ {equiv}</span>}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
