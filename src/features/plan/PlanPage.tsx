import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SegmentedControl } from '@/components/ui';
import { ProfileForm } from './ProfileForm';
import { MacroTargetsForm } from './MacroTargetsForm';
import { DietProfilePanel } from './DietProfilePanel';
import { MealStructurePanel } from './MealStructurePanel';
import { FoodSelectionPanel } from './FoodSelectionPanel';
import { AddonFoodsPanel } from './AddonFoodsPanel';
import { CoveragePanel } from './CoveragePanel';
import { PlanView } from './PlanView';
import { TargetSafetyPanel } from './TargetSafetyPanel';
import { EstimateCarrySettings } from './EstimateCarrySettings';
import { DataPanel } from './DataPanel';
import { FeedbackCard } from '@/features/feedback/FeedbackCard';
import { InstallCard } from '@/features/onboarding/IOSInstallPrompt';

type Section = 'objectif' | 'aliments' | 'semaine' | 'reglages';

const SECTIONS: { value: Section; label: string; intro: string }[] = [
  { value: 'objectif', label: 'Objectif', intro: 'Qui tu es et ce que tu vises : tes calories en découlent.' },
  { value: 'aliments', label: 'Aliments', intro: 'Ce que tu manges et quand : ton plan est construit avec.' },
  { value: 'semaine',  label: 'Semaine',  intro: 'Le résultat : tes 7 menus et ce qu\'ils couvrent.' },
  { value: 'reglages', label: 'Réglages', intro: 'Sécurités, repas mangés dehors, sauvegarde, ton avis.' }
];

/** Dernier onglet ouvert, gardé le temps de la session (on revient où on était). */
let lastSection: Section = 'objectif';

/**
 * Plan & Profil, rangé en 4 onglets pour retrouver un réglage sans tout déplier :
 *  1. Objectif : profil (âge, taille, activité, %MG) + objectif (sèche/maintien/prise, rythme, pause)
 *  2. Aliments : repas de la journée, régime et allergies, mes aliments, ingrédients d'appoint
 *  3. Semaine  : plan de la semaine (lecture seule) + bilan de couverture
 *  4. Réglages : garde-fous de la cible, repas mangés dehors, sauvegarde et données, avis
 * Chaque carte affiche un résumé de son état, visible même repliée.
 */
export function PlanPage() {
  const [section, setSection] = useState<Section>(lastSection);
  const current = SECTIONS.find((s) => s.value === section)!;

  const choose = (s: Section) => {
    lastSection = s;
    setSection(s);
  };

  return (
    <div className="space-y-4 px-5 pb-5">
      <PageHeader title="Plan & Profil" subtitle="Configuration" />

      <div className="space-y-2">
        <SegmentedControl options={SECTIONS} value={section} onChange={choose} />
        <p className="text-xs text-text-muted leading-snug px-1">{current.intro}</p>
      </div>

      {section === 'objectif' && (
        <>
          <ProfileForm />
          <MacroTargetsForm />
        </>
      )}

      {section === 'aliments' && (
        <>
          <MealStructurePanel />
          <DietProfilePanel />
          <FoodSelectionPanel />
          <AddonFoodsPanel />
        </>
      )}

      {section === 'semaine' && (
        <>
          <PlanView />
          <CoveragePanel />
        </>
      )}

      {section === 'reglages' && (
        <>
          {/* Safari iOS seulement : rouvre l'invitation à installer l'app. */}
          <InstallCard />
          <TargetSafetyPanel />
          <EstimateCarrySettings />
          <DataPanel />
          <FeedbackCard />
        </>
      )}
    </div>
  );
}
