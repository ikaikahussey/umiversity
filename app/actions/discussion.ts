"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { optStr, runAction, safePath, str, type ActionState } from "@/lib/action";
import { acceptAnswer, createPost, createThread, vote, type VoteTarget } from "@/lib/services/discussion";
import { addResource, reviewResource } from "@/lib/services/resources";
import { requireUser } from "@/lib/session";

function back(form: FormData) {
  const path = safePath(str(form, "returnTo"), "");
  if (path) revalidatePath(path);
}

export async function createThreadAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let dest: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    const t = await createThread(
      getDb(),
      user,
      { courseId: str(form, "courseId"), unitId: optStr(form, "unitId"), lessonId: optStr(form, "lessonId") },
      { title: str(form, "title"), bodyMd: str(form, "bodyMd") },
    );
    back(form);
    dest = `/c/${str(form, "courseSlug")}/q/${t.id}`;
  });
  if (dest) redirect(dest);
  return state;
}

export async function createPostAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await createPost(getDb(), user, str(form, "threadId"), str(form, "bodyMd"));
    back(form);
    return { ok: true, message: "Answer posted" };
  });
}

export async function voteAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const value = Number(str(form, "value"));
    const score = await vote(
      getDb(),
      user,
      str(form, "targetType") as VoteTarget,
      str(form, "targetId"),
      (value === 1 ? 1 : value === -1 ? -1 : 0) as -1 | 0 | 1,
    );
    back(form);
    return { ok: true, data: score };
  });
}

export async function acceptAnswerAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await acceptAnswer(getDb(), user, str(form, "threadId"), optStr(form, "postId") ?? null);
    back(form);
    return { ok: true, message: "Updated" };
  });
}

export async function addResourceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const r = await addResource(getDb(), user, {
      courseId: str(form, "courseId"),
      unitId: optStr(form, "unitId"),
      lessonId: optStr(form, "lessonId"),
      url: str(form, "url"),
      title: str(form, "title"),
      type: optStr(form, "type"),
      level: optStr(form, "level"),
    });
    back(form);
    return { ok: true, message: r.approved ? "Resource added" : "Thanks — an editor will review your link" };
  });
}

export async function reviewResourceAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let dest: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    const decision = str(form, "decision") === "approve" ? "approve" : "reject";
    await reviewResource(getDb(), user, str(form, "resourceId"), decision);
    back(form);
    dest = `/c/${str(form, "courseSlug")}/edit?notice=${decision === "approve" ? "Resource+approved" : "Resource+removed"}`;
  });
  if (dest) redirect(dest);
  return state;
}
