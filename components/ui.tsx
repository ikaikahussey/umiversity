import type { ReactNode } from "react";

export const inputCls = "umi-input";

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-xs text-umi-muted">{hint}</span>}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={`umi-card ${className ?? ""}`}>{children}</section>;
}

/**
 * Page heading. `display` (default) sets generic headings in Graduate; `title` is for
 * content such as course, lesson, request and people names, which may be Hawaiian and must
 * keep the body face and their own casing; `hero` is the large home heading with a gold rule.
 */
export function PageTitle({
  children,
  sub,
  variant = "display",
}: {
  children: ReactNode;
  sub?: ReactNode;
  variant?: "display" | "title" | "hero";
}) {
  const cls =
    variant === "title" ? "umi-title text-3xl" : variant === "hero" ? "umi-hero-title" : "text-2xl sm:text-3xl";
  return (
    <div className="mb-5">
      <h1 className={cls}>{children}</h1>
      {variant === "hero" && <span className="umi-rule" aria-hidden="true" />}
      {sub && <p className="mt-2 text-umi-muted">{sub}</p>}
    </div>
  );
}

/**
 * Small badge. Status words use the Graduate label style; pass `text` for user-supplied
 * content (credential labels, course names) so it keeps the body face and casing.
 */
export function Pill({
  children,
  tone = "neutral",
  text = false,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "warn";
  text?: boolean;
}) {
  const toneCls = tone === "accent" ? "umi-badge-teal" : tone === "warn" ? "" : "umi-badge-quiet";
  return <span className={`umi-badge ${toneCls} ${text ? "umi-badge-text" : ""}`}>{children}</span>;
}

/** Shows a one-line confirmation passed as ?notice= after a redirecting action. */
export function Notice({ text }: { text?: string | string[] }) {
  if (typeof text !== "string" || !text) return null;
  return (
    <p role="status" className="mb-4 rounded-md border-2 border-umi-teal bg-umi-teal-tint px-3 py-2 text-sm text-umi-ink">
      {text.slice(0, 200)}
    </p>
  );
}
