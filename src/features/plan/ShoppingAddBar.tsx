import { useRef, useState } from 'react';
import { Plus, History } from 'lucide-react';
import { Card } from '@/components/ui';
import { AISLE_EMOJI, AISLE_LABEL } from '@/lib/aisles';
import { guessAisle, recentSuggestions, type ShoppingRecent, type ShoppingState } from '@/lib/shoppingExtras';

interface Props {
  state: ShoppingState;
  /** Ajoute un article ; `recent` = ajout rapide (garde son rayon). */
  onAdd: (name: string, recent?: ShoppingRecent) => void;
}

/**
 * Saisie d'un article « en plus » (capsules de café, déodorant, lessive…).
 * Pensée pour le magasin : une ligne, « Entrée » ajoute et garde le clavier ouvert
 * pour enchaîner ; le rayon deviné s'affiche avant de valider ; les articles déjà
 * achetés une fois reviennent en un tap.
 */
export function ShoppingAddBar({ state, onAdd }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Une fois le clavier ouvert (et la sheet recalée), on fait entrer toute la carte
  // dans la zone visible : champ, rayon deviné et ajouts rapides.
  const revealCard = () => {
    window.setTimeout(() => cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 350);
  };
  const trimmed = value.trim();
  const aisle = trimmed ? guessAisle(trimmed, state.recents) : null;
  const suggestions = recentSuggestions(state, value, trimmed ? 6 : 8);

  const submit = () => {
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div ref={cardRef} className="scroll-mt-2 scroll-mb-4">
    <Card className="!p-0 overflow-hidden">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex items-center gap-2 pl-4 pr-2"
      >
        <Plus size={18} className="shrink-0 text-brand" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={revealCard}
          placeholder="Ajouter : café, déodorant, lessive…"
          aria-label="Ajouter un article à la liste de courses"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="on"
          autoCapitalize="sentences"
          maxLength={60}
          className="flex-1 min-w-0 h-12 bg-transparent text-[15px] text-text placeholder:text-text-muted/60 focus:outline-none"
        />
        {trimmed && (
          <button
            type="submit"
            className="shrink-0 h-9 px-3.5 rounded-xl bg-brand text-white text-sm font-semibold tap"
          >
            Ajouter
          </button>
        )}
      </form>

      {aisle && (
        <div className="px-4 pb-2.5 -mt-1 text-xs text-text-muted">
          Rayon : <span className="font-medium text-text">{AISLE_EMOJI[aisle]} {AISLE_LABEL[aisle]}</span>
          <span className="opacity-80"> · modifiable ensuite</span>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="px-3 pb-3 pt-0.5 space-y-1.5">
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-text-muted">
            <History size={12} />
            Déjà acheté
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((r) => (
              <button
                key={r.name}
                type="button"
                // Garde le focus (et le clavier) sur le champ si on était en train de taper.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onAdd(r.name, r); setValue(''); }}
                className="inline-flex items-center gap-1 max-w-full px-2.5 py-1.5 rounded-full text-[13px] font-medium text-text tap active:bg-white"
                style={{ backgroundColor: '#F4F7FD', border: '1px solid #E3EAF7' }}
              >
                <span className="leading-none">{AISLE_EMOJI[r.aisle]}</span>
                <span className="break-words text-left">{r.name}</span>
                <Plus size={12} className="shrink-0 text-text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
    </div>
  );
}
