"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { runAction, str, type ActionState } from "@/lib/action";
import { appUrl } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { recordRevenue, upsertPartner } from "@/lib/services/affiliates";
import { computeMonthlyPayoutAsStaff, startOnboarding } from "@/lib/services/payouts";
import { setPointsFrozen } from "@/lib/services/points";
import { requireUser } from "@/lib/session";
import { stripeClient } from "@/lib/stripe";

function cents(v: string): number {
  const n = Number(v.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new AppError("invalid", "Enter an amount in dollars");
  return Math.round(n * 100);
}

export async function startOnboardingAction(): Promise<ActionState> {
  let url: string | null = null;
  const state = await runAction(async () => {
    const user = await requireUser();
    if (!process.env.STRIPE_SECRET_KEY) throw new AppError("invalid", "Payouts are not configured yet");
    url = await startOnboarding(getDb(), user, stripeClient(), {
      refresh: appUrl("/settings/payouts?refresh=1"),
      return: appUrl("/settings/payouts?return=1"),
    });
  });
  if (url) redirect(url);
  return state;
}

export async function upsertPartnerAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const p = await upsertPartner(getDb(), user, {
      name: str(form, "name"),
      network: str(form, "network"),
      domain: str(form, "domain"),
      trackingParam: str(form, "trackingParam"),
      payoutEligible: form.get("payoutEligible") === "on",
      termsNote: str(form, "termsNote"),
    });
    revalidatePath("/admin/payouts");
    return { ok: true, message: `Saved ${p.name}` };
  });
}

export async function recordRevenueAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const received = str(form, "receivedAt");
    await recordRevenue(getDb(), user, {
      partnerId: str(form, "partnerId"),
      month: str(form, "month"),
      grossCents: cents(str(form, "gross")),
      reversalsCents: cents(str(form, "reversals") || "0"),
      receivedAt: received ? new Date(`${received}T12:00:00Z`) : new Date(),
    });
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Revenue recorded" };
  });
}

export async function computePayoutAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const r = await computeMonthlyPayoutAsStaff(getDb(), user, str(form, "month"));
    revalidatePath("/admin/payouts");
    return {
      ok: true,
      message: `Pool $${(r.period.poolCents / 100).toFixed(2)} · ${r.allocations.filter((a) => a.status === "pending").length} payees`,
    };
  });
}

export async function freezePointsAction(_p: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const frozen = str(form, "frozen") === "1";
    const u = await setPointsFrozen(getDb(), user, str(form, "handle"), frozen);
    revalidatePath("/admin/payouts");
    return { ok: true, message: `@${u.handle} points ${frozen ? "frozen" : "unfrozen"}` };
  });
}
