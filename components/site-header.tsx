import Link from "next/link";
import { getDb } from "@/db";
import { unreadCount } from "@/lib/services/notifications";
import { getCurrentUser } from "@/lib/session";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(getDb(), user.id) : 0;
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
            <Link href="/notifications" aria-label={`Notifications (${unread} unread)`} data-testid="notif-link">
              🔔{unread > 0 && <span className="ml-0.5 rounded bg-accent px-1 text-xs text-white">{unread}</span>}
            </Link>
            <Link href="/settings">Settings</Link>
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
