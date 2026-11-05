import type { Profile } from '@/types';

/**
 * Profil par défaut, à remplacer par le sien depuis l'onglet Plan.
 * Homme, 30 ans, 178 cm, 80 kg, ~18% MG.
 * Activité "moderate" (1.5) : muscu 3-5x/sem, sédentaire hors salle.
 * Maintien ≈ 2680 kcal, cible mini-sèche = 2300 kcal.
 * Macros : P 157g, L 64g, G 274g.
 */
export const SEED_PROFILE: Profile = {
  id: 'me',
  sex: 'M',
  ageYears: 30,
  heightCm: 178,
  weightKg: 80,
  bodyFatPct: 18,
  activity: 'moderate',
  targetKcal: 2300,
  targetProteinG: 157,
  targetFatG: 64,
  targetCarbsG: 274,
  proteinPerKg: 2.2,
  fatPerKg: 0.8,
  updatedAt: Date.now()
};
