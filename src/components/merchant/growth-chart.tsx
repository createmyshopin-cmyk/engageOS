import React from "react";

interface DataPoint {
  label: string;
  value: number;
}

interface GrowthChartProps {
  data: DataPoint[];
  title?: string;
  subtitle?: string;
}

function buildSvgPath(
  points: { x: number; y: number }[],
  fill: boolean
): string {
  if (points.length < 2) return "";
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
  if (!fill) return d;
  const first = points[0];
  const last = points[points.length - 1];
  return `${d} L ${last.x} 160 L ${first.x} 160 Z`;
}

export function GrowthChart({ data, title = "Customer Growth", subtitle = "Last 7 Days" }: GrowthChartProps) {
  const W = 500;
  const H = 160;
  const PAD_X = 12;
  const PAD_Y = 16;

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => ({
    x: PAD_X + (i / (data.length - 1)) * (W - PAD_X * 2),
    y: PAD_Y + ((maxVal - d.value) / range) * (H - PAD_Y * 2),
  }));

  const linePath = buildSvgPath(points, false);
  const areaPath = buildSvgPath(points, true);

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm p-5 lg:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-black text-[#111827]">{title}</h3>
          <p className="text-[10px] text-[#9CA3AF] font-semibold mt-0.5">
            {subtitle}
          </p>
        </div>
        <span className="text-[9px] font-bold bg-[#F8FAFC] px-2.5 py-1 rounded-lg border border-[#E5E7EB] text-[#6B7280]">
          Auto Syncing ↻
        </span>
      </div>

      {data.length >= 2 ? (
        <>
          {/* Y-axis labels */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ height: 180 }}
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity="0" />
                </linearGradient>
                <filter id="glowLine">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <line
                  key={t}
                  x1={PAD_X}
                  y1={PAD_Y + t * (H - PAD_Y * 2)}
                  x2={W - PAD_X}
                  y2={PAD_Y + t * (H - PAD_Y * 2)}
                  stroke="#E5E7EB"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Area fill */}
              <path d={areaPath} fill="url(#chartGradient)" />

              {/* Line */}
              <path
                d={linePath}
                fill="none"
                stroke="#16A34A"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#glowLine)"
              />

              {/* Data points */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r="5" fill="white" stroke="#16A34A" strokeWidth="2" />
                  <circle cx={p.x} cy={p.y} r="2.5" fill="#16A34A" />
                </g>
              ))}
            </svg>
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between mt-1 px-1">
            {data.map((d) => (
              <span
                key={d.label}
                className="text-[9px] font-medium text-[#9CA3AF]"
              >
                {d.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-36 text-sm text-[#9CA3AF]">
          Not enough data yet. Keep engaging customers!
        </div>
      )}
    </div>
  );
}
