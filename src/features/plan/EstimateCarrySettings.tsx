import { CollapsibleCard, SegmentedControl, HelpHint, ToggleRow } from '@/components/ui';
import { UtensilsCrossed } from 'lucide-react';
import { haptic } from '@/lib/haptic';
import { useProfileStore } from '@/store/profileStore';
import { effectiveTargets } from '@/lib/nutrition';
import { fmtKcal } from '@/lib/format';
import { DEFAULT_CARRY, carryPerDay, carrySettingsOf, type CarrySettings } from '@/lib/estimateRebalance';

const DAYS = ['1', '2', '3'] as const;
const MIN_KCAL = ['100', '150', '200', '300'] as const;
const MAX_PCT = ['5', '10', '15', '20'] as const;
/** Écart d'exemple pour illustrer l'effet des réglages. */
const EXAMPLE_KCAL = 400;

/**
 * Réglages du REPORT d'un repas estimé (cf. lib/estimateRebalance) : sur combien de jours
 * reporter le surplus qui ne rentre pas dans la journée, à partir de quel écart, et combien
 * retirer au plus par jour. Un exemple chiffré montre l'effet sur la journée de l'utilisateur.
 */
export function EstimateCarrySettings() {
  const settings = useProfileStore((s) => s.settings);
  const profile = useProfileStore((s) => s.profile);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  if (!settings) return null;

  const cfg = carrySettingsOf(settings);
  const dayKcal = profile ? effectiveTargets(profile).kcal : 0;
  const update = (patch: Partial<CarrySettings>) =>
    void saveSettings({ ...settings, estimateCarry: { ...cfg, ...patch } });
  const isDefault = cfg.enabled === DEFAULT_CARRY.enabled && cfg.days === DEFAULT_CARRY.days
    && cfg.minKcal === DEFAULT_CARRY.minKcal && cfg.maxShare === DEFAULT_CARRY.maxShare;
  const perDay = carryPerDay(EXAMPLE_KCAL, dayKcal, cfg);

  return (
    <CollapsibleCard
      title="Repas mangés dehors"
      icon={<UtensilsCrossed size={18} />}
      summary={cfg.enabled
        ? `Surplus reporté sur ${cfg.days} jour${cfg.days > 1 ? 's' : ''} · max ${Math.round(cfg.maxShare * 100)} %/j`
        : 'Report du surplus désactivé'}
    >
      <HelpHint>
        Quand tu estimes un repas pris à l'extérieur, que faire du surplus que la
        journée ne peut pas absorber ?
      </HelpHint>

      <ToggleRow
        label="Report des repas estimés"
        checked={cfg.enabled}
        onToggle={() => { haptic('selection'); update({ enabled: !cfg.enabled }); }}
        description={cfg.enabled
          ? 'Actif : quand un repas estimé dépasse ce que la journée peut absorber, le surplus est retiré des féculents et du gras des jours suivants. Les protéines ne bougent jamais.'
          : 'Désactivé : le surplus d\'un repas estimé reste sur sa journée, les jours suivants ne bougent pas.'}
      />

      {cfg.enabled && (
        <>
          <div>
            <div className="text-xs font-medium text-text-muted mb-1.5">Reporter sur</div>
            <SegmentedControl
              options={DAYS.map((d) => ({ value: d, label: d === '1' ? '1 jour' : `${d} jours` }))}
              value={String(cfg.days) as (typeof DAYS)[number]}
              onChange={(v) => update({ days: Number(v) })}
            />
          </div>

          <div>
            <div className="text-xs font-medium text-text-muted mb-1.5">Écart minimal à reporter (kcal)</div>
            <SegmentedControl
              options={MIN_KCAL.map((k) => ({ value: k, label: k }))}
              value={String(cfg.minKcal) as (typeof MIN_KCAL)[number]}
              onChange={(v) => update({ minKcal: Number(v) })}
            />
            <HelpHint>En dessous, l'écart est plus petit que l'imprécision de l'estimation : on le laisse.</HelpHint>
          </div>

          <div>
            <div className="text-xs font-medium text-text-muted mb-1.5">Retrait maximal par jour (% de la journée)</div>
            <SegmentedControl
              options={MAX_PCT.map((p) => ({ value: p, label: `${p} %` }))}
              value={String(Math.round(cfg.maxShare * 100)) as (typeof MAX_PCT)[number]}
              onChange={(v) => update({ maxShare: Number(v) / 100 })}
            />
            <HelpHint>
              {dayKcal > 0 ? <>Soit {fmtKcal(dayKcal * cfg.maxShare)} au plus par jour. </> : null}
              Au-delà de 10-15 %, la faim se fait sentir et le report devient une punition.
            </HelpHint>
          </div>

          {dayKcal > 0 && (
            <div className="rounded-2xl bg-surface-hi border border-border px-3 py-2.5 text-xs leading-snug">
              Exemple : un écart de +{EXAMPLE_KCAL} kcal donne{' '}
              {perDay > 0
                ? <span className="font-semibold">−{fmtKcal(perDay)} sur {cfg.days > 1 ? `chacun des ${cfg.days} jours suivants` : 'le lendemain'}</span>
                : <span className="font-semibold">aucun report</span>}
              {perDay > 0 && perDay * cfg.days < EXAMPLE_KCAL && <> (le reste est laissé de côté)</>}.
            </div>
          )}
        </>
      )}

      {!isDefault && (
        <button
          onClick={() => void saveSettings({ ...settings, estimateCarry: undefined })}
          className="text-xs font-semibold text-brand tap"
        >
          Revenir aux réglages recommandés (2 j · 150 kcal · 10 %)
        </button>
      )}
    </CollapsibleCard>
  );
}
