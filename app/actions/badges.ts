"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { runAction, str, type ActionState } from "@/lib/action";
import { AppError } from "@/lib/errors";
import { endorseBadge, reviewBadge, setBadgeDisplay, submitBadge } from "@/lib/services/badges";
import { requireUser } from "@/lib/session";

export async function submitBadgeAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const type = str(form, "type") as "degree" | "credential" | "community";
    const file = form.get("evidence");
    const evidence =
      file instanceof File && file.size > 0 ? { name: file.name, type: file.type, size: file.size, data: file } : null;
    if (evidence && !process.env.BLOB_READ_WRITE_TOKEN) {
      throw new AppError("invalid", "Document uploads are not configured yet");
    }
    const { vercelEvidenceStore } = await import("@/lib/blob");
    await submitBadge(
      getDb(),
      user,
      {
        type,
        fieldId: str(form, "fieldId"),
        label: str(form, "label"),
        details: str(form, "details"),
        evidence,
      },
      vercelEvidenceStore(),
    );
    revalidatePath("/settings/badges");
    return {
      ok: true,
      message:
        type === "community"
          ? "Submitted. Ask three badge holders in the field to endorse it."
          : "Submitted for review. Your document stays private.",
    };
  });
}

export async function reviewBadgeAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let done = false;
  const state = await runAction(async () => {
    const user = await requireUser();
    await reviewBadge(getDb(), user, str(form, "badgeId"), str(form, "decision") === "verify" ? "verify" : "reject");
    revalidatePath("/admin");
    done = true;
  });
  if (done) redirect(`${str(form, "returnTo") || "/admin"}?notice=Badge+decided`);
  return state;
}

export async function endorseBadgeAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const n = await endorseBadge(getDb(), user, str(form, "badgeId"));
    revalidatePath(`/badges/${str(form, "badgeId")}`);
    return { ok: true, message: `Endorsed (${n} so far)` };
  });
}

export async function setBadgeDisplayAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const b = await setBadgeDisplay(getDb(), user, str(form, "badgeId"), str(form, "display") === "1");
    revalidatePath("/settings/badges");
    revalidatePath(`/u/${user.handle}`);
    return { ok: true, message: b.display ? "Shown on profile" : "Hidden from profile" };
  });
}
