import { useMemo } from 'react';
import { CollapsibleCard, HelpHint } from '@/components/ui';
import { Ban, ShieldAlert } from 'lucide-react';
import type { FoodTag } from '@/types';
import { useFoodsStore } from '@/store/foodsStore';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import {
  DIET_PRESETS, TAG_LABEL, TAG_ORDER, ALLERGEN_TAGS, matchingPreset, isExcluded, usableFoodIds
} from '@/lib/diet';
import { missingEssentialRoles, ROLE_LABEL } from '@/lib/foodSelection';
import { haptic } from '@/lib/haptic';

/**
 * « Régime et allergies » : profil alimentaire et allergies.
 *
 * Distinct de « Mes aliments » à dessein. Décocher un aliment dit « pas envie », et le
 * moteur peut en proposer un autre du même type. Une exclusion dit « je ne peux pas »,
 * et rien ne la contourne : ni la substitution automatique, ni un remplacement proposé,
 * ni une suggestion du bilan de couverture. Confondre les deux, pour une allergie, serait
 * dangereux.
 */
export function DietProfilePanel() {
  const foods = useFoodsStore((s) => s.foods);
  const byId = useFoodsStore((s) => s.byId);
  const settings = useProfileStore((s) => s.settings);
  const setExcludedTags = useProfileStore((s) => s.setExcludedTags);
  const toast = useUIStore((s) => s.toast);

  const excluded = useMemo(() => settings?.excludedTags ?? [], [settings?.excludedTags]);
  const preset = matchingPreset(excluded);

  /** Aliments écartés par les exclusions courantes, par étiquette. */
  const excludedCount = useMemo(() => {
    const m = new Map<FoodTag, number>();
    for (const t of TAG_ORDER) m.set(t, foods.filter((f) => f.tags?.includes(t)).length);
    return m;
  }, [foods]);

  if (!settings) return null;

  /** Rôles essentiels qui n'auraient plus aucun aliment avec ces exclusions. */
  const rolesLostBy = (tags: FoodTag[]) =>
    missingEssentialRoles(usableFoodIds(settings.selectedFoodIds, tags, foods), byId);

  const apply = async (tags: FoodTag[], label: string) => {
    const lost = rolesLostBy(tags);
    if (lost.length > 0) {
      haptic('warning');
      toast(`Impossible : plus aucun aliment en « ${lost.map((r) => ROLE_LABEL[r]).join(', ')} »`, 'error');
      return;
    }
    haptic('selection');
    await setExcludedTags(tags);
    toast(label, 'success');
  };

  const toggleTag = (t: FoodTag) => {
    const next = excluded.includes(t) ? excluded.filter((x) => x !== t) : [...excluded, t];
    void apply(next, excluded.includes(t) ? `${TAG_LABEL[t]} réautorisé` : `${TAG_LABEL[t]} exclu de ta diète`);
  };

  const nExcludedFoods = foods.filter((f) => isExcluded(f, excluded)).length;

  const summary = excluded.length === 0
    ? 'Aucune exclusion'
    : preset
    ? `${preset.label} · ${nExcludedFoods} aliment${nExcludedFoods > 1 ? 's' : ''} écarté${nExcludedFoods > 1 ? 's' : ''}`
    : `Sans ${excluded.map((t) => TAG_LABEL[t].toLowerCase()).join(', ')}`;

  return (
    <CollapsibleCard title="Régime et allergies" icon={<Ban size={18} />} summary={summary}>
      <HelpHint>
        À ne pas confondre avec « Mes aliments » juste en dessous. Là, tu décoches ce dont
        tu n'as pas envie, et l'app peut te proposer autre chose du même type. Ici, tu
        déclares ce que tu ne peux pas manger : plus rien ne le fera revenir dans ton
        menu, ni un remplacement automatique, ni une suggestion.
      </HelpHint>

      <div>
        <span className="block text-xs font-bold uppercase tracking-wide text-text-muted mb-1.5">
          Profil
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {DIET_PRESETS.map((p) => {
            const on = preset?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => apply([...p.tags], `Profil ${p.label.toLowerCase()} appliqué`)}
                className={[
                  'rounded-xl px-3 py-2.5 text-left tap border transition-colors',
                  on ? 'bg-brand/10 border-brand/40' : 'bg-surface-hi border-transparent'
                ].join(' ')}
              >
                <span className={`block text-sm ${on ? 'font-semibold text-brand' : ''}`}>{p.label}</span>
                <span className="block text-[10px] text-text-muted mt-0.5 leading-tight">{p.hint}</span>
              </button>
            );
          })}
        </div>
        {!preset && excluded.length > 0 && (
          <p className="text-[11px] text-text-muted mt-2">
            Tes exclusions ne correspondent à aucun profil type. C'est ta liste ci-dessous
            qui fait foi.
          </p>
        )}
      </div>

      <div>
        <span className="block text-xs font-bold uppercase tracking-wide text-text-muted mb-1.5">
          Allergies et intolérances
        </span>
        <div className="space-y-1.5">
          {TAG_ORDER.map((t) => {
            const on = excluded.includes(t);
            const isAllergen = ALLERGEN_TAGS.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={[
                  'w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 tap text-left border transition-colors',
                  on ? 'bg-danger/10 border-danger/40' : 'bg-surface-hi border-transparent'
                ].join(' ')}
              >
                <span
                  className={[
                    'shrink-0 w-5 h-5 rounded-md flex items-center justify-center',
                    on ? 'bg-danger text-white' : 'border-2 border-border'
                  ].join(' ')}
                  aria-hidden
                >
                  {on && <Ban size={12} strokeWidth={3} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm ${on ? 'font-semibold' : ''}`}>{TAG_LABEL[t]}</span>
                  <span className="block text-[10px] text-text-muted">
                    {excludedCount.get(t) ?? 0} aliment{(excludedCount.get(t) ?? 0) > 1 ? 's' : ''} concerné
                    {(excludedCount.get(t) ?? 0) > 1 ? 's' : ''}
                    {isAllergen && ' · allergène'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {nExcludedFoods > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-surface-hi border border-border px-3 py-2.5">
          <ShieldAlert size={15} className="text-text-muted shrink-0 mt-0.5" />
          <span className="text-[11px] text-text-muted">
            {nExcludedFoods} aliment{nExcludedFoods > 1 ? 's sont écartés' : ' est écarté'} de ta
            diète. Ils restent visibles dans « Mes aliments », barrés, et loggables à la main
            si quelqu'un d'autre les cuisine pour toi.
          </span>
        </div>
      )}

      <HelpHint>
        Une exclusion qui viderait complètement une catégorie essentielle est refusée : ta
        diète ne pourrait plus se composer. Pense aussi au bilan « Ce que ta semaine
        couvre » dans l'onglet Semaine : un profil végétalien, par exemple, laisse un trou en B12 que
        seul un supplément comble.
      </HelpHint>
    </CollapsibleCard>
  );
}
