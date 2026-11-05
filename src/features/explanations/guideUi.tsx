import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui';
import { haptic } from '@/lib/haptic';

/**
 * Briques de mise en page de l'onglet Explications. Tailles de texte volontairement
 * plus grandes que le reste de l'app (15 px pour le corps, 13 px minimum pour les
 * notes) : c'est une page de lecture, pas un tableau de bord.
 */

/** Anneau de focus clavier commun aux éléments interactifs de la page. */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2';

/** Minuscules sans accents (œ → oe) : « oeuf » trouve « Œufs », « seche » trouve « sèche ». */
export function normalize(s: string): string {
  return s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Paragraphe secondaire (gris), lisible : 13 px, interligne aéré. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="text-[13px] text-text-muted leading-relaxed">{children}</p>;
}

/** Mot mis en avant dans un paragraphe. */
export function B({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-text">{children}</span>;
}

/** Encadré titré. `tone` : neutre, mis en avant (brand) ou alerte (warn) / ok (success). */
export function Callout({
  emoji, title, tone = 'neutral', children
}: {
  emoji?: string; title?: ReactNode; tone?: 'neutral' | 'brand' | 'warn' | 'success'; children: ReactNode;
}) {
  const toneCls = {
    neutral: 'bg-surface-hi border-border',
    brand: 'bg-brand/5 border-brand/30',
    warn: 'bg-warn/10 border-warn/30',
    success: 'bg-success/10 border-success/30'
  }[tone];
  return (
    <div className={`rounded-2xl border px-3.5 py-3 space-y-1.5 ${toneCls}`}>
      {title && (
        <div className="font-semibold text-[15px] leading-snug">
          {emoji && <span aria-hidden className="mr-1.5">{emoji}</span>}
          {title}
        </div>
      )}
      <div className="text-[13px] text-text-muted leading-relaxed space-y-1.5">{children}</div>
    </div>
  );
}

/** Formule de calcul avec les vrais chiffres de l'utilisateur. */
export function Formula({ children }: { children: ReactNode }) {
  return (
    <pre className="rounded-xl bg-surface-hi px-3 py-2.5 font-mono text-[13px] leading-relaxed text-text whitespace-pre-wrap break-words">
      {children}
    </pre>
  );
}

/** Étapes numérotées (liste ordonnée sémantique). */
export function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
          <span aria-hidden className="shrink-0 w-6 h-6 rounded-full bg-brand text-white text-xs font-bold flex items-center justify-center mt-px">
            {i + 1}
          </span>
          <span className="flex-1 min-w-0">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** Liste à puces simple. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-1.5 list-disc pl-5 marker:text-brand text-[15px] leading-snug">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

/** « Où le trouver » : chemin de navigation dans l'app, en pastille. */
export function Where({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex flex-wrap items-center gap-1 text-[13px] font-semibold text-brand bg-brand/10 rounded-lg px-2.5 py-1">
      <span aria-hidden>📍</span> <span className="sr-only">Où le trouver : </span>{children}
    </p>
  );
}

/** Ligne d'un onglet de l'app (icône emoji + nom + description). */
export function TabRow({ emoji, name, children }: { emoji: string; name: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div aria-hidden className="text-xl leading-none shrink-0 w-7 text-center pt-0.5">{emoji}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">{name}</div>
        <div className="text-[13px] text-text-muted leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

/** Interrupteur de l'app expliqué, avec son état actuel et son emplacement. */
export function OptionRow({
  title, where, on, onTxt, offTxt
}: {
  title: string; where: string; on: boolean; onTxt: string; offTxt: string;
}) {
  return (
    <Callout title={
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{title}</span>
        <span className={[
          'text-[11px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5',
          on ? 'bg-success/15 text-success' : 'bg-border text-text-muted'
        ].join(' ')}>
          {on ? 'Activé chez toi' : 'Désactivé chez toi'}
        </span>
      </span>
    }>
      <p><B>Activé :</B> {onTxt}</p>
      <p><B>Désactivé :</B> {offTxt}</p>
      <p className="text-brand font-semibold">{where}</p>
    </Callout>
  );
}

/** Terme du lexique (liste de définitions sémantique). */
export function Term({ t, d }: { t: string; d: string }) {
  return (
    <div>
      <dt className="font-semibold text-[15px]">{t}</dt>
      <dd className="text-[13px] text-text-muted leading-relaxed">{d}</dd>
    </div>
  );
}

/** Tuile chiffrée du résumé « Tes chiffres en direct ». */
export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={['rounded-xl px-2.5 py-2', accent ? 'bg-brand/15 border border-brand/40' : 'bg-surface-hi'].join(' ')}>
      <div className="text-[11px] uppercase text-text-muted leading-tight">{label}</div>
      <div className="font-semibold text-[15px] mt-0.5">{value}</div>
    </div>
  );
}

/**
 * Section dépliable accessible : titre dans un <h3>, bouton avec aria-expanded /
 * aria-controls, contenu dans une région nommée. Le résumé sous le titre dit ce qu'on
 * va trouver, pour choisir la bonne section sans l'ouvrir.
 */
export function GuideSection({
  id, icon: Icon, title, summary, open, onToggle, children
}: {
  id: string; icon: LucideIcon; title: string; summary: string; open: boolean; onToggle: () => void; children: ReactNode;
}) {
  const btnId = `guide-${id}-btn`;
  const panelId = `guide-${id}-panel`;
  return (
    <Card className="!p-0 overflow-hidden">
      <h3 className="m-0">
        <button
          id={btnId}
          onClick={() => { haptic('light'); onToggle(); }}
          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left tap active:bg-surface-hi rounded-3xl ${FOCUS_RING}`}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span aria-hidden className="rounded-xl bg-brand/15 text-brand p-2 shrink-0"><Icon size={20} /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold text-[16px] leading-snug">{title}</span>
            <span className="block text-[13px] text-text-muted leading-snug mt-0.5 font-normal">{summary}</span>
          </span>
          <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
            <ChevronDown size={20} className="text-text-muted" />
          </motion.span>
        </button>
      </h3>
      {open && (
        <div id={panelId} role="region" aria-labelledby={btnId} className="px-4 pb-5 pt-1 space-y-3 text-[15px] leading-relaxed text-text">
          {children}
        </div>
      )}
    </Card>
  );
}
