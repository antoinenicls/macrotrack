import { useMemo, useState, useEffect } from 'react';
import { Card, Button, Sheet, EmptyState } from '@/components/ui';
import { Camera } from 'lucide-react';
import { useWeightStore } from '@/store/weightStore';
import { useUIStore } from '@/store/uiStore';
import { todayKey, formatShortDate } from '@/lib/dates';
import type { ProgressPhoto } from '@/types';

export function PhotoGallery() {
  const photos = useWeightStore((s) => s.photos);
  const addPhoto = useWeightStore((s) => s.addPhoto);
  const deletePhoto = useWeightStore((s) => s.deletePhoto);
  const restorePhoto = useWeightStore((s) => s.restorePhoto);
  const toast = useUIStore((s) => s.toast);

  const [compare, setCompare] = useState<[ProgressPhoto?, ProgressPhoto?] | null>(null);

  const sorted = useMemo(() => [...photos].sort((a, b) => b.date.localeCompare(a.date)), [photos]);

  // Mémoïse les URLs object pour ne pas en recréer à chaque render
  const thumbUrls = useMemo(() => new Map(sorted.map((p) => [p.id, URL.createObjectURL(p.thumb)])), [sorted]);
  useEffect(() => () => thumbUrls.forEach((u) => URL.revokeObjectURL(u)), [thumbUrls]);

  const onFile = async (file: File) => {
    try {
      await addPhoto(todayKey(), file);
      toast('Photo ajoutée', 'success');
    } catch (e) {
      console.error(e);
      toast('Erreur lors de l\'ajout', 'error');
    }
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Photos de progression</h3>
        <label className="inline-flex h-9 px-3 items-center gap-2 rounded-xl bg-surface-hi text-text text-sm font-semibold active:scale-[0.98] active:bg-surface transition-transform tap no-select">
          <Camera size={14} /> Ajouter
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="Aucune photo" description="Prends une photo régulière (face + profil) pour visualiser ton évolution." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {sorted.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setCompare((c) => {
                    if (!c) return [p, undefined];
                    if (!c[0]) return [p, c[1]];
                    if (!c[1]) return [c[0], p];
                    return [p, undefined];
                  });
                }}
                className="relative aspect-square overflow-hidden rounded-xl bg-surface-hi"
              >
                <img src={thumbUrls.get(p.id)} alt={p.date} className="absolute inset-0 w-full h-full object-cover" />
                <span className="absolute bottom-1 left-1 right-1 text-[10px] bg-black/50 px-1.5 py-0.5 rounded text-white">
                  {formatShortDate(p.date)}
                </span>
              </button>
            ))}
          </div>

          <Sheet open={!!compare && !!compare[0] && !!compare[1]} onClose={() => setCompare(null)} title="Comparaison" fullScreen>
            {compare && compare[0] && compare[1] && (
              <ComparePair
                a={compare[0]}
                b={compare[1]}
                onDelete={async (id) => {
                  const removed = await deletePhoto(id);
                  setCompare(null);
                  toast('Photo supprimée', 'success', {
                    action: { label: 'Annuler', onPress: () => removed && restorePhoto(removed) }
                  });
                }}
              />
            )}
          </Sheet>
        </>
      )}
    </Card>
  );
}

function ComparePair({ a, b, onDelete }: { a: ProgressPhoto; b: ProgressPhoto; onDelete: (id: string) => void }) {
  const ua = useMemo(() => URL.createObjectURL(a.blob), [a]);
  const ub = useMemo(() => URL.createObjectURL(b.blob), [b]);
  useEffect(() => () => { URL.revokeObjectURL(ua); URL.revokeObjectURL(ub); }, [ua, ub]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <figure>
          <img src={ua} alt={a.date} className="w-full aspect-[3/4] object-cover rounded-xl" />
          <figcaption className="text-xs text-text-muted mt-1 text-center">{formatShortDate(a.date)}</figcaption>
        </figure>
        <figure>
          <img src={ub} alt={b.date} className="w-full aspect-[3/4] object-cover rounded-xl" />
          <figcaption className="text-xs text-text-muted mt-1 text-center">{formatShortDate(b.date)}</figcaption>
        </figure>
      </div>
      <div className="flex gap-2">
        <Button variant="danger" block onClick={() => onDelete(a.id)}>Supprimer la 1ère</Button>
        <Button variant="danger" block onClick={() => onDelete(b.id)}>Supprimer la 2e</Button>
      </div>
    </div>
  );
}
