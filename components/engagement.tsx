import Link from "next/link";
import { Card } from "./ui";

export function StreakBadge({ current, longest, freezesLeft }: { current: number; longest: number; freezesLeft: number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">Streak</p>
      <p className="text-2xl font-bold" data-testid="streak">
        {current} {current === 1 ? "day" : "days"}
      </p>
      <p className="text-xs text-muted">
        Longest {longest} · {freezesLeft} freeze{freezesLeft === 1 ? "" : "s"} left this week
      </p>
    </Card>
  );
}

export function GoalBar({ value, target, type, percent }: { value: number; target: number; type: string; percent: number }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-muted">Weekly goal</p>
      <p className="text-sm" data-testid="weekly-goal">
        {value} / {target} {type}
      </p>
      <div className="mt-2 h-2 w-full rounded bg-stone-200" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-2 rounded bg-accent" style={{ width: `${percent}%` }} />
      </div>
      <Link href="/settings" className="mt-1 block text-xs text-accent">
        Change goal
      </Link>
    </Card>
  );
}

type Domain = { domain: string; fields: { id: string; name: string; units: number }[] };

/** Grid of domains and fields shaded by units completed. */
export function BreadthMap({ domains }: { domains: Domain[] }) {
  const shade = (n: number) =>
    n === 0 ? "bg-stone-100 text-stone-500" : n < 3 ? "bg-teal-100 text-teal-900" : n < 6 ? "bg-teal-300 text-teal-950" : "bg-teal-600 text-white";
  return (
    <div className="flex flex-col gap-3" data-testid="breadth-map">
      {domains.map((d) => (
        <div key={d.domain}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{d.domain}</p>
          <div className="flex flex-wrap gap-1">
            {d.fields.map((f) => (
              <span key={f.id} className={`rounded px-2 py-1 text-xs ${shade(f.units)}`} title={`${f.units} units completed`}>
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
