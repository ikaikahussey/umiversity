"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { runAction, str, type ActionState } from "@/lib/action";
import {
  assignCourseRole,
  createLesson,
  createUnit,
  proposeRevision,
  revertLesson,
  reviewRevision,
  updateCourseOverview,
} from "@/lib/services/courses";
import type { CourseRole } from "@/lib/services/permissions";
import { requireUser } from "@/lib/session";

function refreshCourse(slug: string) {
  revalidatePath(`/c/${slug}`, "layout");
}

export async function createUnitAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const unit = await createUnit(getDb(), user, str(form, "courseId"), {
      title: str(form, "title"),
      summary: str(form, "summary"),
    });
    refreshCourse(str(form, "courseSlug"));
    return { ok: true, message: `Added unit “${unit.title}”` };
  });
}

export async function createLessonAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const lesson = await createLesson(getDb(), user, str(form, "unitId"), {
      title: str(form, "title"),
      minutes: Number(str(form, "minutes") || 10),
    });
    refreshCourse(str(form, "courseSlug"));
    return { ok: true, message: `Added lesson “${lesson.title}”` };
  });
}

export async function proposeRevisionAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await proposeRevision(getDb(), user, str(form, "lessonId"), {
      title: str(form, "title"),
      bodyMd: str(form, "bodyMd"),
      summary: str(form, "summary"),
    });
    refreshCourse(str(form, "courseSlug"));
    return { ok: true, message: "Edit proposed. An editor will review it." };
  });
}

export async function reviewRevisionAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const decision = str(form, "decision") === "approve" ? "approve" : "reject";
    const res = await reviewRevision(getDb(), user, str(form, "revisionId"), decision);
    const slug = str(form, "courseSlug");
    refreshCourse(slug);
    const notice =
      decision === "approve" ? `Approved${res.courseOpened ? " — the course is now Open" : ""}` : "Rejected";
    redirect(`/c/${slug}/edit?notice=${encodeURIComponent(notice)}`);
  });
}

export async function revertLessonAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const lessonId = str(form, "lessonId");
    await revertLesson(getDb(), user, lessonId, str(form, "revisionId"));
    const slug = str(form, "courseSlug");
    refreshCourse(slug);
    redirect(`/c/${slug}/edit/${lessonId}?notice=Reverted`);
  });
}

export async function assignRoleAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const target = await assignCourseRole(
      getDb(),
      user,
      str(form, "courseId"),
      str(form, "handle"),
      str(form, "role") as CourseRole | "none",
    );
    refreshCourse(str(form, "courseSlug"));
    return { ok: true, message: `Updated @${target.handle}` };
  });
}

export async function updateOverviewAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    await updateCourseOverview(getDb(), user, str(form, "courseId"), {
      summary: str(form, "summary"),
      overviewMd: str(form, "overviewMd"),
      keywords: str(form, "keywords"),
    });
    refreshCourse(str(form, "courseSlug"));
    return { ok: true, message: "Overview saved" };
  });
}
