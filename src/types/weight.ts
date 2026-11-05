export interface WeightEntry {
  id: string;
  date: string;   // YYYY-MM-DD
  kg: number;
  /**
   * % masse grasse mesuré par la balance à impédance (optionnel : absent les jours
   * où l'on se pèse sans balance complète). La dernière valeur connue est synchronisée
   * sur `profile.bodyFatPct` (BMR Katch-McArdle, plancher de sécurité, cible protéique).
   */
  bodyFatPct?: number;
  note?: string;
}

export type MeasurementType = 'waist' | 'hips' | 'chest' | 'arm' | 'thigh' | 'neck' | 'custom';

export const MEASUREMENT_LABEL: Record<MeasurementType, string> = {
  waist: 'Tour de taille',
  hips: 'Tour de hanches',
  chest: 'Tour de poitrine',
  arm: 'Tour de bras',
  thigh: 'Tour de cuisse',
  neck: 'Tour de cou',
  custom: 'Autre'
};

export interface Measurement {
  id: string;
  date: string;
  type: MeasurementType;
  customLabel?: string;
  /** cm */
  value: number;
}

export interface ProgressPhoto {
  id: string;
  date: string;
  blob: Blob;
  thumb: Blob;
  note?: string;
}
