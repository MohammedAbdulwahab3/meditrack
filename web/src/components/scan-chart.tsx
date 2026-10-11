"use client";

import { useState } from "react";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * Single-series daily bar chart. No legend (the card title names the series); 4px rounded
 * data ends on a shared baseline, 2px gaps between bars, hover tooltip per bar, and a
 * visually hidden table for screen readers.
 */
export function ScanChart({ data }: { data: { day: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const h = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-2xl font-bold tabular-nums text-slate-900">{formatNumber(total)}</p>
        <p className="h-5 text-xs text-slate-500" aria-live="polite">
          {h ? `${formatDate(h.day)}: ${formatNumber(h.count)} checks` : "Hover a bar for details"}
        </p>
      </div>
      <div className="relative h-36" onMouseLeave={() => setHover(null)} aria-hidden="true">
        {[0.5, 1].map((f) => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-slate-100" style={{ bottom: `${f * 100}%` }} />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px] border-b border-slate-300">
          {data.map((d, i) => (
            <div
              key={d.day}
              className="flex h-full flex-1 cursor-default items-end"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
            >
              <div
                className={`w-full rounded-t-[4px] transition-colors ${hover === i ? "bg-brand-700" : "bg-brand-500"}`}
                style={{ height: d.count === 0 ? 0 : `max(2px, ${(d.count / max) * 100}%)` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500" aria-hidden="true">
        <span>{data[0] && formatDate(data[0].day)}</span>
        <span>Today</span>
      </div>
      <table className="sr-only">
        <caption>Public verification checks per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Checks</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
