import type { ReactNode } from "react";

export const inputCls = "w-full rounded border border-line bg-white px-2 py-1.5 text-sm";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-lg border border-line bg-card p-4 ${className ?? ""}`}>{children}</section>;
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "warn" }) {
  const cls =
    tone === "accent"
      ? "bg-accent-soft text-accent"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-stone-100 text-stone-700";
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${cls}`}>{children}</span>;
}

/** Shows a one-line confirmation passed as ?notice= after a redirecting action. */
export function Notice({ text }: { text?: string | string[] }) {
  if (typeof text !== "string" || !text) return null;
  return (
    <p role="status" className="mb-4 rounded border border-accent bg-accent-soft px-3 py-2 text-sm text-accent">
      {text.slice(0, 200)}
    </p>
  );
}
