"use client";

import { useState } from "react";
import { money } from "@/lib/format";

type Day = { day: string; visits: number; revenue: number };

export default function VisitsChart({ data, currency }: { data: Day[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);

  const max = Math.max(1, ...data.map((d) => d.visits));
  const W = 720;
  const H = 168;
  const gap = 3;
  const barW = Math.max(2, W / Math.max(data.length, 1) - gap);

  const active = hover !== null ? data[hover] : null;

  return (
    <div className="relative">
      <div className="flex items-baseline justify-between">
        <h3 className="section-title">Visits, last 30 days</h3>
        <span className="text-xs tabular-nums text-ink-mute">
          {data.reduce((a, d) => a + d.visits, 0).toLocaleString("en-UG")} total
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-5 w-full"
        role="img"
        aria-label="Daily visits over the last 30 days"
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#16151314" strokeWidth="1" />
        {data.map((d, i) => {
          const h = Math.max(d.visits === 0 ? 0 : 3, (d.visits / max) * (H - 16));
          const x = i * (barW + gap);
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={H - h}
                width={barW}
                height={h}
                rx={Math.min(3, barW / 2)}
                fill={hover === i ? "#163E32" : "#1B4D3E"}
                opacity={hover === null || hover === i ? 1 : 0.35}
              />
              <rect
                x={x - gap / 2}
                y={0}
                width={barW + gap}
                height={H}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex justify-between text-[11px] text-ink-mute">
        <span>{data[0] ? new Date(data[0].day).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : ""}</span>
        <span>
          {data.at(-1)
            ? new Date(data.at(-1)!.day).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
            : ""}
        </span>
      </div>

      {active && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg bg-ink px-3 py-2 text-xs text-paper">
          <div className="font-medium">
            {new Date(active.day).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
            })}
          </div>
          <div className="mt-0.5 text-white/65">{active.visits} visits</div>
          <div className="text-white/65">{money(active.revenue, currency)}</div>
        </div>
      )}
    </div>
  );
}
