import { AppError } from "@/lib/errors";

export type ActionState = { ok: boolean; message?: string; error?: string; data?: unknown } | null;

/** Converts expected failures into form state; unexpected errors are rethrown. */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    throw err;
  }
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export function optStr(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}
