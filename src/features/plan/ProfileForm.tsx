import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { CollapsibleCard, NumberInput, HelpHint, ToggleRow } from '@/components/ui';
import { useProfileStore } from '@/store/profileStore';
import { useWeightStore } from '@/store/weightStore';
import { fmtKg, fmtPct } from '@/lib/format';
import { ACTIVITY_LABEL, type ActivityLevel } from '@/types';

export function ProfileForm() {
  const profile = useProfileStore((s) => s.profile);
  const settings = useProfileStore((s) => s.settings);
  const save = useProfileStore((s) => s.saveProfile);
  const recalc = useProfileStore((s) => s.recalcTargetsFromWeight);
  const weights = useWeightStore((s) => s.weights);

  // Poids ET masse grasse affichés = dernière pesée (onglet Poids), sinon la valeur
  // du profil. Ce sont des données DÉRIVÉES : on ne les édite pas ici, elles suivent
  // toujours la pesée (le %MG se saisit dans l'onglet Poids, au moment de la pesée).
  const currentWeightKg = weights.length
    ? weights.reduce((a, b) => (b.date > a.date ? b : a)).kg
    : profile?.weightKg;
  const withBf = weights.filter((w) => w.bodyFatPct != null);
  const currentBodyFatPct = withBf.length
    ? withBf.reduce((a, b) => (b.date > a.date ? b : a)).bodyFatPct
    : profile?.bodyFatPct;

  const [age, setAge] = useState<number | ''>(profile?.ageYears ?? '');
  const [height, setHeight] = useState<number | ''>(profile?.heightCm ?? '');
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity ?? 'moderate');

  const useBf = profile?.useBodyFat !== false;

  // Active / désactive le suivi de la masse grasse. En OFF : on efface le %MG du
  // profil (les formules basculent sur Mifflin-St Jeor / protéines sur poids total) et
  // on masque la saisie. En ON : on remet la dernière %MG connue des pesées si dispo.
  const toggleUseBodyFat = async () => {
    if (!profile) return;
    const next = !useBf;
    const restored = next ? currentBodyFatPct : undefined;
    await save({
      ...profile,
      useBodyFat: next,
      ...(next ? (restored != null ? { bodyFatPct: restored } : {}) : { bodyFatPct: undefined })
    });
    if (settings?.adaptiveTargets) await recalc();
  };

  useEffect(() => {
    if (!profile) return;
    const t = setTimeout(async () => {
      await save({
        ...profile,
        ageYears: typeof age === 'number' ? age : profile.ageYears,
        heightCm: typeof height === 'number' ? height : profile.heightCm,
        // weightKg et bodyFatPct ne sont PAS édités ici : pilotés par la dernière pesée.
        weightKg: profile.weightKg,
        activity
      });
      // Mode adaptatif : âge/taille/activité changent le TDEE → on recalcule
      // les cibles et on re-scale le plan pour qu'il reste cohérent. En mode
      // cible fixe, on ne touche à rien (l'utilisateur a figé ses calories).
      if (settings?.adaptiveTargets) await recalc();
    }, 350);
    return () => clearTimeout(t);
  }, [age, height, activity]);

  if (!profile) return null;

  return (
    <CollapsibleCard
      title="Mon profil"
      icon={<User size={18} />}
      summary={[
        typeof age === 'number' ? `${age} ans` : null,
        typeof height === 'number' ? `${height} cm` : null,
        currentWeightKg != null ? fmtKg(currentWeightKg) : null,
        useBf && currentBodyFatPct != null ? `${fmtPct(currentBodyFatPct)} MG` : null,
        ACTIVITY_LABEL[activity].split(' (')[0]
      ].filter(Boolean).join(' · ')}
    >
      <HelpHint>
        Sert à calculer ta dépense calorique (TDEE) et tes cibles macros.
      </HelpHint>

      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Âge"    value={age}    onChange={setAge}    suffix="ans" />
        <NumberInput label="Taille" value={height} onChange={setHeight} suffix="cm" />
        <div>
          <span className="block text-sm text-text-muted mb-1.5">Poids actuel</span>
          <div className="w-full h-12 px-3 rounded-xl bg-surface border border-border flex items-center text-text">
            {currentWeightKg != null ? fmtKg(currentWeightKg) : '–'}
          </div>
          <span className="block text-xs text-text-muted mt-1">Dernière pesée</span>
        </div>
        {useBf && (
          <div>
            <span className="block text-sm text-text-muted mb-1.5">Masse grasse</span>
            <div className="w-full h-12 px-3 rounded-xl bg-surface border border-border flex items-center text-text">
              {currentBodyFatPct != null ? fmtPct(currentBodyFatPct) : '–'}
            </div>
            <span className="block text-xs text-text-muted mt-1">Dernière pesée</span>
          </div>
        )}
      </div>
      <HelpHint>
        {useBf
          ? 'Poids et masse grasse viennent de ta dernière pesée : pour les modifier, va dans l\'onglet Poids et enregistre une pesée (le % MG y est optionnel). Pèse-toi le matin à jeun.'
          : 'Le poids vient de ta dernière pesée (onglet Poids). Suivi de la masse grasse désactivé : les calculs se basent sur ton poids, ta taille et ton âge. Pèse-toi le matin à jeun.'}
      </HelpHint>

      {/* Toggle : suivre ou non la masse grasse (élèves sans balance à impédance) */}
      <ToggleRow
        label="Suivre la masse grasse (%MG)"
        checked={useBf}
        onToggle={toggleUseBodyFat}
        description={useBf
          ? 'Activé : BMR plus précis (Katch-McArdle), protéines calées sur la masse maigre, rythme adapté à ta sécheresse.'
          : 'Désactivé : pas besoin de balance à impédance. Formules standard (Mifflin-St Jeor), protéines sur le poids total.'}
      />

      <div>
        <span className="block text-sm text-text-muted mb-1.5">Niveau d'activité</span>
        <div className="space-y-1.5">
          {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
            <button
              key={a}
              onClick={() => setActivity(a)}
              className={[
                'w-full text-left px-3 py-2.5 rounded-xl text-sm tap',
                activity === a ? 'bg-brand text-white' : 'bg-surface-hi text-text'
              ].join(' ')}
            >
              {ACTIVITY_LABEL[a]}
            </button>
          ))}
        </div>
        <HelpHint>
          Compte tout sur la journée entière, pas seulement le sport. Si tu marches peu hors salle → "Modéré".
        </HelpHint>
      </div>
    </CollapsibleCard>
  );
}
