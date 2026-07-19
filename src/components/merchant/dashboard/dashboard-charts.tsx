"use client";

/** Small SVG chart primitives for the merchant dashboard. */

export interface ChartPoint {
  label: string;
  value: number;
}

function niceMax(values: number[]): number {
  const max = Math.max(...values, 0);
  if (max <= 4) return 4;
  if (max <= 10) return 10;
  return Math.ceil(max / 5) * 5;
}

/** Tiny sparkline for KPI cards. */
export function SparkLine({
  data,
  color = "#16A34A",
  height = 32,
  width = 88,
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth="1.5" />
      </svg>
    );
  }

  const max = niceMax(data);
  const pad = 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - pad * 2);
    const y = height - pad - (v / max) * (height - pad * 2);
    return { x, y };
  });
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="2.5" fill={color} />
    </svg>
  );
}

/** Area line chart for 7-day trends. */
export function AreaTrendChart({
  series,
  height = 160,
}: {
  series: ChartPoint[];
  height?: number;
}) {
  const W = 520;
  const H = height;
  const PAD_X = 20;
  const PAD_Y = 16;
  const values = series.map((d) => d.value);
  const max = niceMax(values);

  if (series.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-neutral-50 border border-dashed border-neutral-200 text-xs text-neutral-400 font-medium"
        style={{ height }}
      >
        Not enough activity yet — charts appear as customers engage.
      </div>
    );
  }

  const points = series.map((d, i) => ({
    x: PAD_X + (i / (series.length - 1)) * (W - PAD_X * 2),
    y: PAD_Y + ((max - d.value) / max) * (H - PAD_Y * 2),
    label: d.label,
    value: d.value,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = `${line} L ${points[points.length - 1].x} ${H - PAD_Y} L ${points[0].x} ${H - PAD_Y} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        <defs>
          <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16A34A" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={PAD_X}
            y1={PAD_Y + t * (H - PAD_Y * 2)}
            x2={W - PAD_X}
            y2={PAD_Y + t * (H - PAD_Y * 2)}
            stroke="#F3F4F6"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#dashArea)" />
        <path d={line} fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="white" stroke="#16A34A" strokeWidth="2" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 px-1">
        {series.map((d) => (
          <span key={d.label} className="text-[9px] font-semibold text-neutral-400">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Horizontal mini bars — e.g. traffic sources. */
export function MiniBarChart({
  items,
  color = "#16A34A",
}: {
  items: { label: string; value: number }[];
  color?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) {
    return <p className="text-xs text-neutral-400 py-4 text-center">No data yet.</p>;
  }

  return (
    <div className="space-y-3">
      {items.slice(0, 6).map((item) => {
        const pct = Math.round((item.value / max) * 100);
        return (
          <div key={item.label}>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="font-bold text-neutral-700 truncate max-w-[60%]">{item.label}</span>
              <span className="font-black text-neutral-900">{item.value}</span>
            </div>
            <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Stacked funnel steps with mini bars. */
export function FunnelChart({
  steps,
}: {
  steps: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="space-y-2.5">
      {steps.map((s) => {
        const pct = max > 0 ? Math.round((s.value / max) * 100) : 0;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="text-[9px] font-bold text-neutral-500 w-20 shrink-0 uppercase tracking-wide">
              {s.label}
            </span>
            <div className="flex-1 h-7 bg-neutral-50 rounded-lg overflow-hidden relative">
              <div
                className="h-full rounded-lg transition-all duration-700"
                style={{ width: `${Math.max(pct, s.value > 0 ? 8 : 0)}%`, backgroundColor: s.color }}
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-black text-neutral-800">
                {s.value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Donut chart for win vs loss or source split. */
export function DonutChart({
  segments,
  size = 88,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return (
      <div
        className="rounded-full border-4 border-neutral-100 flex items-center justify-center text-[10px] font-bold text-neutral-400"
        style={{ width: size, height: size }}
      >
        —
      </div>
    );
  }

  const r = (size - 10) / 2;
  const cx = size / 2;
  const cy = size / 2;
  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const start = offset;
      offset += frac;
      return { ...s, start, end: offset };
    });

  function arcPath(start: number, end: number) {
    const a0 = start * 2 * Math.PI - Math.PI / 2;
    const a1 = end * 2 * Math.PI - Math.PI / 2;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = end - start > 0.5 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
  }

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size}>
        {arcs.map((a) => (
          <path key={a.label} d={arcPath(a.start, a.end)} fill={a.color} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.55} fill="white" />
        <text x={cx} y={cy + 4} textAnchor="middle" className="text-[11px] font-black fill-neutral-900">
          {total}
        </text>
      </svg>
      <div className="space-y-1.5 min-w-0">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[10px]">
            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
            <span className="font-semibold text-neutral-600 truncate">{s.label}</span>
            <span className="font-black text-neutral-900 ml-auto">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
