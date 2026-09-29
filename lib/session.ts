import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import { getDb } from "@/db";
import { E2E_COOKIE, e2eAuthEnabled } from "@/lib/auth/e2e";
import { authConfigured, getAuth } from "@/lib/auth/server";
import { AppError } from "@/lib/errors";
import { ensureUser, type AppUser } from "@/lib/services/users";

async function readIdentity() {
  // Identity is per-request; opt every caller out of static prerendering.
  await connection();
  if (e2eAuthEnabled()) {
    const raw = (await cookies()).get(E2E_COOKIE)?.value;
    if (raw) {
      const [id, name] = decodeURIComponent(raw).split("|");
      return { id, name: name ?? id, email: `${id}@example.test`, image: null };
    }
    if (!authConfigured()) return null;
  }
  if (!authConfigured()) return null;
  const { data } = await getAuth().getSession();
  const u = data?.user;
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, image: u.image ?? null };
}

/** The signed-in user's app profile, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const identity = await readIdentity();
  if (!identity) return null;
  return ensureUser(getDb(), identity);
});

export async function requireUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError("unauthenticated", "Sign in to continue");
  return user;
}
