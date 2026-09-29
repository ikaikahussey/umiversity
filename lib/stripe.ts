/**
 * Minimal Stripe Connect client over the REST API (Express accounts,
 * onboarding links, transfers). Uses fetch, so no SDK dependency.
 */
export type StripeClient = {
  createExpressAccount(input: { email?: string | null; userId: string }): Promise<{ id: string }>;
  createAccountLink(input: { account: string; refreshUrl: string; returnUrl: string }): Promise<{ url: string }>;
  retrieveAccount(id: string): Promise<{ id: string; payoutsEnabled: boolean; detailsSubmitted: boolean }>;
  createTransfer(input: {
    amountCents: number;
    destination: string;
    transferGroup: string;
    idempotencyKey: string;
  }): Promise<{ id: string }>;
};

function form(data: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) if (v !== undefined) p.append(k, v);
  return p;
}

export function stripeClient(secretKey = process.env.STRIPE_SECRET_KEY): StripeClient {
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY is not set");
  async function call<T>(method: "GET" | "POST", path: string, body?: URLSearchParams, idem?: string): Promise<T> {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idem ? { "idempotency-key": idem } : {}),
      },
      body,
    });
    const json = (await res.json()) as T & { error?: { message?: string } };
    if (!res.ok) throw new Error(`Stripe ${path}: ${json.error?.message ?? res.status}`);
    return json;
  }
  return {
    async createExpressAccount({ email, userId }) {
      return call<{ id: string }>(
        "POST",
        "/accounts",
        form({
          type: "express",
          email: email ?? undefined,
          "capabilities[transfers][requested]": "true",
          "metadata[user_id]": userId,
        }),
        `acct-${userId}`,
      );
    },
    async createAccountLink({ account, refreshUrl, returnUrl }) {
      return call<{ url: string }>(
        "POST",
        "/account_links",
        form({ account, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" }),
      );
    },
    async retrieveAccount(id) {
      const a = await call<{ id: string; payouts_enabled: boolean; details_submitted: boolean }>("GET", `/accounts/${encodeURIComponent(id)}`);
      return { id: a.id, payoutsEnabled: a.payouts_enabled, detailsSubmitted: a.details_submitted };
    },
    async createTransfer({ amountCents, destination, transferGroup, idempotencyKey }) {
      return call<{ id: string }>(
        "POST",
        "/transfers",
        form({ amount: String(amountCents), currency: "usd", destination, transfer_group: transferGroup }),
        idempotencyKey,
      );
    },
  };
}
