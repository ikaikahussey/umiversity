import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-line bg-card">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="text-base font-semibold text-accent">
          Umiversity
        </Link>
        <Link href="/courses">Courses</Link>
        <Link href="/requests">Requests</Link>
        <form action="/search" className="ml-auto flex">
          <input
            name="q"
            aria-label="Search"
            placeholder="Search (e.g. olelo)"
            className="w-40 rounded border border-line px-2 py-1 sm:w-56"
          />
        </form>
        {user ? (
          <>
            {(user.role === "admin" || user.role === "moderator") && <Link href="/admin">Admin</Link>}
            <Link href={`/u/${user.handle}`} data-testid="profile-link">
              @{user.handle}
            </Link>
            <UserMenu />
          </>
        ) : (
          <Link href="/auth/sign-in" className="rounded bg-accent px-3 py-1 text-white">
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}
