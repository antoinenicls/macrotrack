export type Sex = 'M' | 'F';

/**
 * Direction de l'objectif nutritionnel.
 *  - 'cut'      : sèche (déficit, perte de poids visée)
 *  - 'maintain' : maintien (ni déficit ni surplus)
 *  - 'bulk'     : prise de masse (surplus, gain de poids visé)
 * Source de vérité de la direction : évite de deviner via le signe de `deficitKcal`
 * (ambigu à 0). Le moteur du coach reçoit un `deficitKcal` SIGNÉ (positif = déficit,
 * négatif = surplus) dérivé de ce mode et du rythme visé.
 */
export type GoalMode = 'cut' | 'maintain' | 'bulk';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very-active';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.5,
  active: 1.725,
  'very-active': 1.9
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentary: 'Sédentaire',
  light: 'Léger (1-3 séances/sem)',
  moderate: 'Modéré (4-5 séances/sem)',
  active: 'Actif (6-7 séances + cardio)',
  'very-active': 'Très actif (athlète)'
};

export interface Profile {
  id: 'me';
  name?: string;
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** % masse grasse (optionnel). Si présent ET `useBodyFat !== false`, on utilise Katch-McArdle. */
  bodyFatPct?: number;
  /**
   * L'utilisateur suit-il sa masse grasse ? `false` = NON (pas de balance à impédance) :
   * on masque la saisie du %MG et les calculs basculent sur les formules SANS masse grasse
   * (BMR Mifflin-St Jeor, protéines sur le poids total, fourchettes de rythme par défaut).
   * Absent / `true` = OUI (comportement historique). Quand on passe à `false`, `bodyFatPct`
   * est effacé pour que tout le moteur adapte ses formules automatiquement.
   */
  useBodyFat?: boolean;
  /** Poids cible (kg) pour la projection d'atteinte d'objectif (optionnel). */
  goalWeightKg?: number;
  activity: ActivityLevel;
  /** Cibles : si vides → calculées auto. */
  targetKcal?: number;
  targetProteinG?: number;
  targetFatG?: number;
  targetCarbsG?: number;
  /** Paramètres de calcul macro auto */
  proteinPerKg: number; // g/kg de poids
  fatPerKg: number;     // g/kg de poids
  updatedAt: number;
}

export interface MacroTargets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
