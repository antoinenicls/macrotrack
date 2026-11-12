import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Plus, History, ChevronDown, Check, X } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import { haptic } from '@/lib/haptic';
import { AISLE_EMOJI, AISLE_LABEL } from '@/lib/aisles';
import { guessAisle, isInList, recentSuggestions, type ShoppingRecent, type ShoppingState } from '@/lib/shoppingExtras';

interface Props {
  state: ShoppingState;
  /** Ajoute un article ; `recent` = repris de l'historique (garde son rayon). */
  onAdd: (name: string, recent?: ShoppingRecent) => void;
  /** Retire un article de l'historique « Déjà acheté ». */
  onForget: (name: string) => void;
}

/**
 * Ajout d'articles « en plus » (capsules de café, déodorant, lessive…).
 *
 * Repos : deux lignes-boutons, « Ajouter un article » et « Déjà acheté » (historique
 * dépliable). Le champ n'apparaît qu'au tap sur « Ajouter un article » ; une fois
 * l'article ajouté (bouton ou touche Entrée), on revient à l'état de repos et le
 * clavier se ferme.
 */
export function ShoppingAddBar({ state, onAdd, onForget }: Props) {
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const trimmed = value.trim();
  const aisle = trimmed ? guessAisle(trimmed, state.recents) : null;
  const matches = trimmed ? recentSuggestions(state, value, 4) : [];

  const startTyping = () => {
    haptic('light');
    // Rendu synchrone puis focus DANS le geste : sinon iOS n'ouvre pas le clavier.
    flushSync(() => { setTyping(true); setHistoryOpen(false); });
    inputRef.current?.focus();
    // Le clavier ouvert, on fait entrer toute la carte dans la zone visible.
    window.setTimeout(() => cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);
  };
  const stopTyping = () => {
    setValue('');
    setTyping(false);
  };
  const submit = () => {
    if (!trimmed) return;
    onAdd(trimmed);
    stopTyping();
  };
  const pick = (r: ShoppingRecent) => {
    onAdd(r.name, r);
    stopTyping();
  };

  return (
    <div ref={cardRef} className="scroll-mt-2 scroll-mb-4">
      <Card className="!p-0 overflow-hidden">
        {typing ? (
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            className="p-3 space-y-2.5"
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              // Tap ailleurs sans rien avoir tapé : on referme simplement.
              onBlur={() => { if (!value.trim()) stopTyping(); }}
              placeholder="Ex. capsules de café, lessive…"
              aria-label="Nom de l'article"
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="on"
              autoCapitalize="sentences"
              maxLength={60}
              className="w-full h-12 px-3 rounded-xl bg-surface-hi border border-border text-text placeholder:text-text-muted/60 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />

            {aisle && (
              <div className="px-1 text-xs text-text-muted">
                Rayon : <span className="font-medium text-text">{AISLE_EMOJI[aisle]} {AISLE_LABEL[aisle]}</span>
              </div>
            )}

            {matches.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {matches.map((r) => (
                  <button
                    key={r.name}
                    type="button"
                    // Garde le focus (et le clavier) le temps du tap.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(r)}
                    className="inline-flex items-center gap-1 max-w-full px-2.5 py-1.5 rounded-full text-[13px] font-medium text-text tap"
                    style={{ backgroundColor: '#F4F7FD', border: '1px solid #E3EAF7' }}
                  >
                    <span className="leading-none">{AISLE_EMOJI[r.aisle]}</span>
                    <span className="break-words text-left">{r.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onMouseDown={(e) => e.preventDefault()}
                onClick={stopTyping}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={!trimmed}
                onMouseDown={(e) => e.preventDefault()}
                leadingIcon={<Plus size={18} strokeWidth={2.5} />}
              >
                Ajouter
              </Button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={startTyping}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left tap active:bg-surface-hi transition-colors"
            >
              <span className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-brand">
                <Plus size={18} strokeWidth={2.5} className="text-white" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-brand">Ajouter un article</span>
                <span className="block text-xs text-text-muted mt-0.5">Café, hygiène, entretien…</span>
              </span>
            </button>

            {state.recents.length > 0 && (
              <>
                <div className="h-px mx-4" style={{ backgroundColor: '#EEF2F8' }} />
                <button
                  type="button"
                  onClick={() => { haptic('light'); setHistoryOpen((o) => !o); }}
                  aria-expanded={historyOpen}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left tap active:bg-surface-hi transition-colors"
                >
                  <span className="shrink-0 grid place-items-center w-8 h-8 rounded-full" style={{ backgroundColor: '#F4F7FD' }}>
                    <History size={16} className="text-text-muted" />
                  </span>
                  <span className="flex-1 min-w-0 text-[15px] font-medium text-text">Déjà acheté</span>
                  <span className="text-xs tabular-nums text-text-muted">{state.recents.length}</span>
                  <ChevronDown size={16} className={`shrink-0 text-text-muted transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                </button>

                {historyOpen && (
                  <ul className="pb-1">
                    {state.recents.map((r) => {
                      const already = isInList(state.extras, r.name);
                      return (
                        <li key={r.name} className="flex items-center gap-2 pl-4 pr-2 py-1.5">
                          <span className="shrink-0 w-8 text-center text-base leading-none">{AISLE_EMOJI[r.aisle]}</span>
                          <span className="flex-1 min-w-0 text-[15px] leading-tight break-words text-text">{r.name}</span>
                          {already ? (
                            <span className="shrink-0 inline-flex items-center gap-1 h-9 px-2 text-xs font-medium text-brand">
                              <Check size={14} strokeWidth={3} />
                              Dans la liste
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onAdd(r.name, r)}
                              aria-label={`Ajouter ${r.name} à la liste`}
                              className="shrink-0 inline-flex items-center gap-1 h-9 px-3 rounded-xl bg-brand/10 text-brand text-sm font-semibold tap active:bg-brand/20"
                            >
                              <Plus size={15} strokeWidth={2.5} />
                              Ajouter
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { haptic('light'); onForget(r.name); }}
                            aria-label={`Retirer ${r.name} de l'historique`}
                            className="shrink-0 w-9 h-9 grid place-items-center rounded-xl text-text-muted/60 tap active:bg-surface-hi"
                          >
                            <X size={16} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
