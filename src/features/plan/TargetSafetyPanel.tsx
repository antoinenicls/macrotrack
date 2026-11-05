import { CollapsibleCard, HelpHint, ToggleRow } from '@/components/ui';
import { ShieldCheck } from 'lucide-react';
import { useProfileStore } from '@/store/profileStore';
import { useUIStore } from '@/store/uiStore';
import { bmr } from '@/lib/nutrition';
import { fmtKcal } from '@/lib/format';
import { haptic } from '@/lib/haptic';

/**
 * Garde-fous de la cible calorique, sortis de « Mon objectif » : on les règle une fois,
 * ils n'ont pas à encombrer le choix sèche / maintien / prise de masse.
 *  - Garde anti-emballement : remonte (sèche) / baisse (prise) la cible si le poids bouge
 *    plus vite que le rythme visé.
 *  - Plancher de sécurité BMR : la cible ne descend jamais sous le métabolisme de base.
 *    Désactivable pour un utilisateur averti, le plancher absolu (1500 H / 1200 F) reste.
 */
export function TargetSafetyPanel() {
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const saveSettings = useProfileStore((s) => s.saveSettings);
  const recalc = useProfileStore((s) => s.recalcTargetsFromWeight);
  const toast = useUIStore((s) => s.toast);

  if (!profile || !settings) return null;

  // Mode explicite si présent, sinon inféré du signe legacy (surplus = déficit négatif).
  const isBulk = settings.goalMode ? settings.goalMode === 'bulk' : (settings.deficitKcal ?? 0) < 0;
  const guardOn = settings.slowdownGuardEnabled ?? true;
  // Le toggle représente le plancher (activé = protégé), donc `floorOn = !allowBelowBmr`.
  const floorOn = !(settings.allowBelowBmr ?? false);
  const restingBmr = Math.round(bmr(profile));
  const absoluteFloor = profile.sex === 'M' ? 1500 : 1200;

  const toggleGuard = async () => {
    haptic('selection');
    const nextGuard = !guardOn;
    await saveSettings({ ...settings, slowdownGuardEnabled: nextGuard });
    await recalc();
    toast(
      isBulk
        ? (nextGuard ? 'Garde lean-bulk activée' : 'Garde désactivée : dirty bulk')
        : (nextGuard ? 'Garde anti-trop-rapide activée' : 'Garde désactivée : sèche agressive'),
      'success'
    );
  };

  const toggleBmrFloor = async () => {
    haptic('selection');
    const nextFloorOn = !floorOn;
    await saveSettings({ ...settings, allowBelowBmr: !nextFloorOn });
    await recalc();
    toast(
      nextFloorOn
        ? 'Plancher de sécurité BMR réactivé'
        : `Plancher BMR désactivé : cible autorisée jusqu'à ${fmtKcal(absoluteFloor)} min`,
      'success'
    );
  };

  const nOn = (guardOn ? 1 : 0) + (floorOn ? 1 : 0);

  return (
    <CollapsibleCard
      title="Garde-fous de la cible"
      icon={<ShieldCheck size={18} />}
      summary={nOn === 2 ? 'Tous activés (recommandé)' : nOn === 0 ? 'Tous désactivés' : '1 sur 2 activé'}
    >
      <HelpHint>
        Des sécurités qui empêchent ta cible calorique de partir trop loin. Laisse-les
        activées sauf si tu sais précisément ce que tu fais.
      </HelpHint>

      <ToggleRow
        label={isBulk ? 'Garde anti-prise-trop-rapide (lean bulk)' : 'Garde anti-perte-trop-rapide'}
        checked={guardOn}
        onToggle={toggleGuard}
        description={isBulk
          ? (guardOn
              ? 'Active : si tu prends plus vite que visé, la cible baisse de −150 kcal pour limiter le gras.'
              : 'Désactivée : dirty bulk assumé, la cible ne baisse jamais pour te ralentir.')
          : (guardOn
              ? 'Active : si tu perds plus vite que visé, la cible remonte de +150 kcal pour préserver le muscle.'
              : 'Désactivée : sèche agressive assumée, la cible ne remonte jamais pour te ralentir.')}
      />

      <ToggleRow
        label="Plancher de sécurité (métabolisme de base)"
        checked={floorOn}
        onToggle={toggleBmrFloor}
        description={floorOn
          ? `Activé : la cible ne descend jamais sous ton BMR (${fmtKcal(restingBmr)}). Recommandé.`
          : `Désactivé : tu autorises de descendre sous ton BMR si ton objectif l'exige ; plancher absolu ${fmtKcal(absoluteFloor)} conservé. Réservé aux utilisateurs avertis : surveille énergie, sommeil et récup.`}
      />
    </CollapsibleCard>
  );
}
