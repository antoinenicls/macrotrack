import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TrendPoint } from '@/lib/trend';
import { formatShortDate } from '@/lib/dates';

/** Couleurs des séries — exportées pour que les légendes restent synchro. */
export const TREND_CHART_COLORS = {
  raw: 'rgb(229 100 92)',  // corail — mesure brute (bruit hydrique)
  avg: 'rgb(0 96 223)'    // #0060DF — tendance lissée : le signal, donc la couleur de marque
};

interface Props {
  /** Points datés déjà lissés (via buildTrend / buildValueTrend). */
  data: TrendPoint[];
  /** Unité affichée dans le tooltip ('kg', '%', …). */
  unit: string;
  /** Décimales du tooltip. */
  decimals?: number;
  /** Marge (dans l'unité) ajoutée autour du min/max pour l'axe Y. */
  domainPad?: number;
  rawColor?: string;
  avgColor?: string;
  /** Libellés du tooltip pour chaque série. */
  rawLabel?: string;
  avgLabel?: string;
  /**
   * Graphiques partageant le même `syncId` : glisser le doigt sur l'un déplace le curseur
   * (et l'infobulle) au même jour sur les autres. Synchro par index → les séries doivent
   * couvrir les mêmes dates (cas de buildTrend / buildValueTrend sur une même plage).
   */
  syncId?: string;
}

/**
 * Courbe d'évolution générique (poids, masse grasse…) : mesure brute + tendance lissée.
 * Les trous (jours sans mesure) ne sont pas reliés pour la série brute.
 */
export function TrendChart({
  data,
  unit,
  decimals = 2,
  domainPad = 0.5,
  rawColor = TREND_CHART_COLORS.raw,
  avgColor = TREND_CHART_COLORS.avg,
  rawLabel = 'Mesure',
  avgLabel = 'Tendance',
  syncId
}: Props) {
  const muted = 'rgb(109 116 136)';
  const surface = 'rgb(255 255 255)';
  const border = 'rgb(228 224 213)';

  return (
    <div className="w-full h-56">
      <ResponsiveContainer>
        <LineChart data={data} syncId={syncId} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(21, 25, 44, 0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => formatShortDate(d)}
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            domain={[`dataMin - ${domainPad}`, `dataMax + ${domainPad}`]}
            tick={{ fill: muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={36}
            allowDecimals
          />
          <Tooltip
            contentStyle={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, fontSize: 12, boxShadow: '0 4px 16px -4px rgba(21,25,44,0.10)' }}
            labelStyle={{ color: muted }}
            labelFormatter={(d: string) => formatShortDate(d)}
            formatter={((v: unknown, name: unknown) => {
              if (v == null) return '–';
              const num = typeof v === 'number' ? v : Number(v);
              return [`${num.toFixed(decimals)} ${unit}`, name === 'raw' ? rawLabel : avgLabel];
            }) as never}
          />
          <Line type="monotone" dataKey="raw" stroke={rawColor} strokeWidth={2} dot={{ r: 2, fill: rawColor }} connectNulls={false} />
          <Line type="monotone" dataKey="avg" stroke={avgColor} strokeWidth={2.5} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
