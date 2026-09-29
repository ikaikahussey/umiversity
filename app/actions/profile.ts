"use server";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { optStr, runAction, str, type ActionState } from "@/lib/action";
import { requireUser } from "@/lib/session";
import { updateProfile } from "@/lib/services/users";

export async function updateProfileAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const reminder = str(form, "reminderHour");
    const updated = await updateProfile(getDb(), user.id, {
      handle: optStr(form, "handle"),
      name: optStr(form, "name"),
      bio: str(form, "bio"),
      timezone: optStr(form, "timezone"),
      weeklyGoalType: (optStr(form, "weeklyGoalType") as "minutes" | "lessons" | undefined) ?? undefined,
      weeklyGoalTarget: form.has("weeklyGoalTarget") ? Number(str(form, "weeklyGoalTarget")) : undefined,
      reminderHour: reminder === "" ? null : Number(reminder),
      notifyEmail: form.get("notifyEmail") === "on",
      digestEmail: form.get("digestEmail") === "on",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved. Your profile is at /u/${updated.handle}` };
  });
}
