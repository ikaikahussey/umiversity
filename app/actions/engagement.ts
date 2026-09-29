"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { runAction, str, type ActionState } from "@/lib/action";
import { POLYMATH_LABELS, completeLesson, reviewCard, scheduleCard, setFollow } from "@/lib/services/engagement";
import { markAllRead } from "@/lib/services/notifications";
import { requireUser } from "@/lib/session";

function back(form: FormData) {
  const path = str(form, "returnTo");
  if (path.startsWith("/")) revalidatePath(path);
}

export async function completeLessonAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let dest: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    const r = await completeLesson(getDb(), user, str(form, "lessonId"));
    back(form);
    revalidatePath("/");
    const parts = [r.alreadyCompleted ? "Already completed" : "Lesson complete"];
    if (r.unitCompleted) parts.push("unit finished — badge earned");
    for (const lvl of r.polymathLevelsReached) parts.push(`${POLYMATH_LABELS[lvl as 1 | 2 | 3]} reached`);
    parts.push(`streak ${r.streak.current} day${r.streak.current === 1 ? "" : "s"}`);
    const returnTo = str(form, "returnTo");
    dest = `${returnTo.startsWith("/") ? returnTo : "/"}?notice=${encodeURIComponent(parts.join(" · "))}`;
  });
  if (dest) redirect(dest);
  return state;
}

export async function followAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const on = str(form, "on") === "1";
    await setFollow(getDb(), user.id, str(form, "courseId"), on);
    back(form);
    revalidatePath("/");
    return { ok: true, message: on ? "Following" : "Unfollowed" };
  });
}

export async function reviewCardAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const s = await reviewCard(getDb(), user, str(form, "cardId"));
    revalidatePath("/");
    return { ok: true, message: `Reviewed · streak ${s.current}` };
  });
}

export async function scheduleCardAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await scheduleCard(getDb(), user, str(form, "courseId"), {
      kind: str(form, "kind"),
      body: str(form, "body"),
      answer: str(form, "answer"),
      scheduledFor: str(form, "scheduledFor"),
    });
    back(form);
    return { ok: true, message: "Card scheduled" };
  });
}

export async function markNotificationsReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await markAllRead(getDb(), user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "All read" };
  });
}
