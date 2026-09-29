import Link from "next/link";
import { getDb } from "@/db";
import { unreadCount } from "@/lib/services/notifications";
import { getCurrentUser } from "@/lib/session";
import { Wordmark } from "./logo";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(getDb(), user.id) : 0;
  return (
    <header className="umi-header">
      <div className="mx-auto grid max-w-5xl grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 px-4 py-3 lg:grid-cols-[auto_1fr_auto_auto]">
        <Link href="/" aria-label="Umiversity home" className="inline-flex shrink-0 items-center">
          <Wordmark className="h-7 w-auto md:h-9" />
        </Link>
        <div className="flex items-center justify-end gap-3 lg:order-last">
          {user ? (
            <>
              <Link
                href={`/u/${user.handle}`}
                data-testid="profile-link"
                className="max-w-[9rem] truncate text-sm font-semibold text-umi-ink no-underline hover:text-umi-teal"
              >
                @{user.handle}
              </Link>
              <UserMenu />
            </>
          ) : (
            <Link href="/auth/sign-in" className="umi-btn">
              Sign in
            </Link>
          )}
        </div>
        <nav
          aria-label="Main"
          className="col-span-2 -mx-4 flex items-center gap-5 overflow-x-auto px-4 lg:col-span-1 lg:mx-0 lg:px-0"
        >
          <NavLink href="/courses">Courses</NavLink>
          <NavLink href="/requests">Requests</NavLink>
          {user && (
            <>
              <NavLink href="/notifications" aria-label={`Notifications (${unread} unread)`} data-testid="notif-link">
                <span aria-hidden="true">🔔</span>
                {unread > 0 && <span className="umi-badge ml-1">{unread}</span>}
              </NavLink>
              <NavLink href="/settings">Settings</NavLink>
              {(user.role === "admin" || user.role === "moderator") && <NavLink href="/admin">Admin</NavLink>}
            </>
          )}
        </nav>
        <form action="/search" role="search" className="col-span-2 lg:col-span-1">
          <input name="q" aria-label="Search" placeholder="Search (e.g. olelo)" className="umi-input lg:w-56" />
        </form>
      </div>
    </header>
  );
}
