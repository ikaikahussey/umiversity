"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { runAction, str, type ActionState } from "@/lib/action";
import {
  mergeRequest,
  promoteRequest,
  rejectRequest,
  submitRequest,
  voteRequest,
  type Similar,
} from "@/lib/services/requests";
import { requireUser } from "@/lib/session";

export type SubmitRequestState = (ActionState & { matches?: Similar[] }) | null;

export async function submitRequestAction(_p: SubmitRequestState, form: FormData): Promise<SubmitRequestState> {
  let createdId: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    const res = await submitRequest(getDb(), user, {
      title: str(form, "title"),
      description: str(form, "description"),
      fieldId: str(form, "fieldId"),
      confirmNotDuplicate: form.get("confirmNotDuplicate") === "on",
    });
    if (res.status === "duplicates") {
      return { ok: false, error: "Similar requests or courses exist. Vote on one, or confirm yours is different.", data: res.matches };
    }
    createdId = res.request.id;
    revalidatePath("/requests");
  });
  if (createdId) redirect(`/requests/${createdId}`);
  return state ? { ...state, matches: (state.data as Similar[] | undefined) ?? undefined } : state;
}

export async function voteRequestAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let promoted: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    const id = str(form, "requestId");
    const res = await voteRequest(getDb(), user, id, str(form, "on") === "1");
    promoted = res.promotedCourseSlug;
    revalidatePath("/requests");
    revalidatePath(`/requests/${id}`);
    return { ok: true, message: res.voted ? "Vote counted" : "Vote removed" };
  });
  if (promoted) redirect(`/c/${promoted}?notice=${encodeURIComponent("This request reached its vote goal and is now a draft course.")}`);
  return state;
}

export async function moderateRequestAction(_p: ActionState, form: FormData): Promise<ActionState> {
  let dest: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    const db = getDb();
    const id = str(form, "requestId");
    const op = str(form, "op");
    if (op === "reject") {
      await rejectRequest(db, user, id);
      dest = `/requests/${id}`;
    } else if (op === "promote") {
      const course = await promoteRequest(db, id, user);
      dest = course ? `/c/${course.slug}` : `/requests/${id}`;
    } else if (op === "merge") {
      const target = str(form, "targetId").trim().replace(/^.*\/requests\//, "");
      await mergeRequest(db, user, id, target);
      dest = `/requests/${target}`;
    }
    revalidatePath("/requests");
  });
  if (dest) redirect(dest);
  return state;
}
