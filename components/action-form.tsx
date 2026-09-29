"use client";
import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/lib/action";

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  submitLabel: string;
  className?: string;
  resetOnSuccess?: boolean;
  testId?: string;
};

/** A form bound to a server action that shows its success or error message inline. */
export function ActionForm({ action, children, submitLabel, className, resetOnSuccess, testId }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className ?? "flex flex-col gap-3"}
      data-testid={testId}
      key={resetOnSuccess && state?.ok ? JSON.stringify(state) : undefined}
    >
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="umi-btn"
        >
          {pending ? "Working…" : submitLabel}
        </button>
        {state?.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
        {state?.ok && state.message && (
          <p role="status" className="text-sm font-semibold text-umi-teal">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}

export function SubmitButton({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <button type="submit" className={className ?? "umi-btn-secondary"}>
      {children}
    </button>
  );
}
