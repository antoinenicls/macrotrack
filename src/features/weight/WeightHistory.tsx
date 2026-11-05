import { useMemo, useState } from 'react';
import { Card, IconButton, EmptyState } from '@/components/ui';
import { Trash2, ChevronDown } from 'lucide-react';
import { useWeightStore } from '@/store/weightStore';
import { useUIStore } from '@/store/uiStore';
import { formatHumanDate } from '@/lib/dates';
import { fmtKg, fmtPct } from '@/lib/format';
import type { WeightEntry } from '@/types';

/**
 * Liste des pesées sous forme de menu déroulant, REPLIÉ par défaut.
 * Le bandeau "Historique · N pesées" est cliquable : il déplie/replie toutes
 * les pesées dans une zone scrollable à hauteur bornée.
 * Suppression via bouton dédié + confirmation inline ; undo via toast.
 */
export function WeightHistory() {
  const weights = useWeightStore((s) => s.weights);
  const deleteWeight = useWeightStore((s) => s.deleteWeight);
  const restoreWeight = useWeightStore((s) => s.restoreWeight);
  const toast = useUIStore((s) => s.toast);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const sorted = useMemo(
    () => [...weights].sort((a, b) => b.date.localeCompare(a.date)),
    [weights]
  );

  const handleDelete = async (w: WeightEntry) => {
    setConfirmId(null);
    const removed = await deleteWeight(w.id);
    toast('Pesée supprimée', 'success', {
      action: { label: 'Annuler', onPress: () => removed && restoreWeight(removed) }
    });
  };

  const isEmpty = sorted.length === 0;

  return (
    <Card>
      <button
        onClick={() => { if (!isEmpty) setExpanded((e) => !e); }}
        disabled={isEmpty}
        className="w-full flex items-center justify-between gap-3 tap disabled:cursor-default"
      >
        <h3 className="font-semibold">Historique</h3>
        <div className="flex items-center gap-2">
          {!isEmpty && (
            <span className="text-xs text-text-muted tabular-nums">{sorted.length} pesées</span>
          )}
          {!isEmpty && (
            <ChevronDown size={18} className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>

      {isEmpty ? (
        <div className="mt-3">
          <EmptyState title="Aucune pesée enregistrée" description="Appuie sur 'Ajouter' pour saisir ton poids du matin." />
        </div>
      ) : expanded && (
        <>
          <ul
            className="space-y-2 mt-3 max-h-80 overflow-y-auto pr-1"
            style={{ overscrollBehavior: 'contain' }}
          >
            {sorted.map((w) => {
              const confirming = confirmId === w.id;
              return (
                <li key={w.id}>
                  {confirming ? (
                    <div className="px-3 py-2.5 flex items-center justify-between gap-3 rounded-xl bg-danger/10 border border-danger/30">
                      <span className="text-sm text-text flex-1 min-w-0">
                        Supprimer la pesée du {formatHumanDate(w.date)} ?
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setConfirmId(null)}
                          className="text-xs font-medium text-text-muted active:text-text tap px-2 py-1"
                        >
                          Annuler
                        </button>
                        <button
                          onClick={() => handleDelete(w)}
                          className="text-xs font-semibold text-white bg-danger rounded-lg px-3 py-1.5 tap active:opacity-80"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                      <span className="text-sm">{formatHumanDate(w.date)}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold tabular-nums">
                          {fmtKg(w.kg)}
                          {w.bodyFatPct != null && (
                            <span className="ml-1.5 font-normal text-text-muted">· {fmtPct(w.bodyFatPct)}</span>
                          )}
                        </span>
                        <IconButton label="Supprimer" onClick={() => setConfirmId(w.id)}>
                          <Trash2 size={16} className="text-text-muted" />
                        </IconButton>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
