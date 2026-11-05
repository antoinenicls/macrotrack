import { create } from 'zustand';
import type { WeightEntry, Measurement, ProgressPhoto } from '@/types';
import { weightsRepo, measurementsRepo, photosRepo } from '@/services/repositories';
import { uid } from '@/lib/id';

interface WeightState {
  weights: WeightEntry[];
  measurements: Measurement[];
  photos: ProgressPhoto[];
  loaded: boolean;
  load: () => Promise<void>;

  upsertWeight: (date: string, kg: number, bodyFatPct?: number, note?: string) => Promise<void>;
  /** Supprime et retourne l'entrée pour permettre un undo. */
  deleteWeight: (id: string) => Promise<WeightEntry | undefined>;
  /** Ré-insère une entrée supprimée. */
  restoreWeight: (entry: WeightEntry) => Promise<void>;

  addMeasurement: (m: Omit<Measurement, 'id'>) => Promise<void>;
  deleteMeasurement: (id: string) => Promise<Measurement | undefined>;
  restoreMeasurement: (entry: Measurement) => Promise<void>;

  addPhoto: (date: string, file: File, note?: string) => Promise<void>;
  deletePhoto: (id: string) => Promise<ProgressPhoto | undefined>;
  restorePhoto: (entry: ProgressPhoto) => Promise<void>;
}

/** Poids le plus récent (par date) parmi les pesées, ou undefined si aucune. */
function latestWeightKg(weights: WeightEntry[]): number | undefined {
  if (weights.length === 0) return undefined;
  return weights.reduce((a, b) => (b.date > a.date ? b : a)).kg;
}

/**
 * % masse grasse le plus récent RENSEIGNÉ (par date). On ignore les pesées sans MG
 * (jours sans balance complète) : la dernière valeur connue reste valable et n'est
 * jamais écrasée par un jour « poids seul ».
 */
function latestBodyFatPct(weights: WeightEntry[]): number | undefined {
  const withBf = weights.filter((w) => typeof w.bodyFatPct === 'number');
  if (withBf.length === 0) return undefined;
  return withBf.reduce((a, b) => (b.date > a.date ? b : a)).bodyFatPct;
}

/**
 * Synchronise le PROFIL avec la pesée la plus récente (= source de vérité).
 * Le poids profil sert aux calculs BMR/TDEE/macros : il doit toujours refléter la
 * dernière pesée. De même, la dernière masse grasse connue alimente le %MG du profil
 * (BMR Katch-McArdle, plancher de sécurité, cible protéique sur masse maigre) → logger
 * la MG garde le moteur calibré au fil de la sèche. Si le mode adaptatif est actif, on
 * recalcule aussi les cibles. Lazy import pour éviter un cycle weightStore ↔ profileStore.
 */
async function syncProfileWeight(weights: WeightEntry[]): Promise<void> {
  const latest = latestWeightKg(weights);
  if (latest == null) return;
  try {
    const { useProfileStore } = await import('./profileStore');
    const ps = useProfileStore.getState();
    if (!ps.profile) return;
    // Suivi %MG désactivé (pas de balance à impédance) → on n'alimente JAMAIS le
    // profil en masse grasse, même si une ancienne pesée en contient une.
    const useBf = ps.profile.useBodyFat !== false;
    const latestBf = useBf ? latestBodyFatPct(weights) : undefined;
    const weightChanged = ps.profile.weightKg !== latest;
    const bfChanged = latestBf != null && ps.profile.bodyFatPct !== latestBf;
    if (weightChanged || bfChanged) {
      await ps.saveProfile({
        ...ps.profile,
        weightKg: latest,
        ...(latestBf != null ? { bodyFatPct: latestBf } : {})
      });
    }
    if (ps.settings?.adaptiveTargets) {
      await ps.recalcTargetsFromWeight();
    }
  } catch (e) {
    console.warn('[weight.sync] échec synchro profil', e);
  }
}

async function makeThumbnail(file: File, maxSize = 300): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.8));
}

export const useWeightStore = create<WeightState>((set, get) => ({
  weights: [],
  measurements: [],
  photos: [],
  loaded: false,

  async load() {
    const [weights, measurements, photos] = await Promise.all([
      weightsRepo.all(),
      measurementsRepo.all(),
      photosRepo.all()
    ]);
    set({ weights, measurements, photos, loaded: true });
  },

  async upsertWeight(date, kg, bodyFatPct, note) {
    // Une seule pesée par jour : on cherche par date
    const existing = get().weights.find((w) => w.date === date);
    // MG absente à la saisie (pesée sans balance complète) → on conserve celle déjà
    // enregistrée pour ce jour plutôt que de l'effacer.
    const bf = bodyFatPct ?? existing?.bodyFatPct;
    const entry: WeightEntry = {
      id: existing?.id ?? uid(),
      date,
      kg,
      ...(bf != null ? { bodyFatPct: bf } : {}),
      ...(note != null ? { note } : {})
    };
    await weightsRepo.put(entry);
    const next = [...get().weights.filter((w) => w.id !== entry.id), entry];
    set({ weights: next });

    // Le poids du PROFIL = dernière pesée (source de vérité pour BMR/TDEE/macros).
    // syncProfileWeight recalcule aussi les cibles si le mode adaptatif est actif.
    await syncProfileWeight(next);
  },

  async deleteWeight(id) {
    const entry = get().weights.find((w) => w.id === id);
    await weightsRepo.delete(id);
    const next = get().weights.filter((w) => w.id !== id);
    set({ weights: next });
    // La dernière pesée a peut-être changé : on resynchronise le poids du profil.
    await syncProfileWeight(next);
    return entry;
  },

  async restoreWeight(entry) {
    await weightsRepo.put(entry);
    const next = [...get().weights.filter((w) => w.id !== entry.id), entry];
    set({ weights: next });
    await syncProfileWeight(next);
  },

  async addMeasurement(m) {
    const entry: Measurement = { ...m, id: uid() };
    await measurementsRepo.put(entry);
    set({ measurements: [...get().measurements, entry] });
  },

  async deleteMeasurement(id) {
    const entry = get().measurements.find((m) => m.id === id);
    await measurementsRepo.delete(id);
    set({ measurements: get().measurements.filter((m) => m.id !== id) });
    return entry;
  },

  async restoreMeasurement(entry) {
    await measurementsRepo.put(entry);
    set({ measurements: [...get().measurements.filter((m) => m.id !== entry.id), entry] });
  },

  async addPhoto(date, file, note) {
    const thumb = await makeThumbnail(file);
    const entry: ProgressPhoto = { id: uid(), date, blob: file, thumb, note };
    await photosRepo.put(entry);
    set({ photos: [...get().photos, entry] });
  },

  async deletePhoto(id) {
    const entry = get().photos.find((p) => p.id === id);
    await photosRepo.delete(id);
    set({ photos: get().photos.filter((p) => p.id !== id) });
    return entry;
  },

  async restorePhoto(entry) {
    await photosRepo.put(entry);
    set({ photos: [...get().photos.filter((p) => p.id !== entry.id), entry] });
  }
}));
