import type React from "react";
import Link from "next/link";
import { Card } from "./ui";

export function StreakBadge({ current, longest, freezesLeft }: { current: number; longest: number; freezesLeft: number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-umi-muted">Streak</p>
      <p className="text-2xl font-bold" data-testid="streak">
        {current} {current === 1 ? "day" : "days"}
      </p>
      <p className="text-xs text-umi-muted">
        Longest {longest} · {freezesLeft} freeze{freezesLeft === 1 ? "" : "s"} left this week
      </p>
    </Card>
  );
}

export function GoalBar({ value, target, type, percent }: { value: number; target: number; type: string; percent: number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-umi-muted">Weekly goal</p>
      <p className="text-sm" data-testid="weekly-goal">
        {value} / {target} {type}
      </p>
      <div className="mt-2 h-2 w-full rounded bg-umi-line" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded bg-umi-teal" style={{ width: `${percent}%` }} />
      </div>
      <Link href="/settings" className="mt-1 block text-xs text-umi-teal">
        Change goal
      </Link>
    </Card>
  );
}

type Domain = { domain: string; fields: { id: string; name: string; units: number }[] };

/** Grid of domains and fields shaded by units completed. */
export function BreadthMap({ domains }: { domains: Domain[] }) {
  // Teal tints of the brand color; ink text on light tints, cream on full teal (all ≥ 4.5:1).
  const shade = (n: number): { className: string; style?: React.CSSProperties } =>
    n === 0
      ? { className: "bg-umi-cream text-umi-muted ring-1 ring-inset ring-umi-line" }
      : n < 3
        ? { className: "text-umi-ink", style: { background: "color-mix(in srgb, var(--umi-teal) 15%, var(--umi-paper))" } }
        : n < 6
          ? { className: "text-umi-ink", style: { background: "color-mix(in srgb, var(--umi-teal) 35%, var(--umi-paper))" } }
          : { className: "bg-umi-teal text-umi-cream" };
  return (
    <div className="flex flex-col gap-3" data-testid="breadth-map">
      {domains.map((d) => (
        <div key={d.domain}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-umi-muted">{d.domain}</p>
          <div className="flex flex-wrap gap-1">
            {d.fields.map((f) => (
              <span key={f.id} className={`rounded px-2 py-1 text-xs ${shade(f.units).className}`} style={shade(f.units).style} title={`${f.units} units completed`}>
                {f.name}
                {f.units > 0 && <strong className="ml-1">{f.units}</strong>}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
