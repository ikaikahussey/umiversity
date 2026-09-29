import Link from "next/link";
import { redirect } from "next/navigation";
import { markNotificationsReadAction } from "@/app/actions/engagement";
import { ActionForm } from "@/components/action-form";
import { Card, PageTitle } from "@/components/ui";
import { getDb } from "@/db";
import { listNotifications } from "@/lib/services/notifications";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  const items = await listNotifications(getDb(), user.id);
  return (
    <main className="flex flex-col gap-4">
      <PageTitle sub={<Link href="/settings" className="text-umi-teal">Email settings</Link>}>Notifications</PageTitle>
      <ActionForm action={markNotificationsReadAction} submitLabel="Mark all read">
        <span />
      </ActionForm>
      {items.length === 0 && <p className="text-sm text-umi-muted">Nothing yet.</p>}
      <ul className="flex flex-col gap-2" data-testid="notifications">
        {items.map((n) => (
          <li key={n.id}>
            <Card className={n.readAt ? "opacity-70" : ""}>
              <p className="text-sm">
                {n.href ? (
                  <Link href={n.href} className="text-umi-teal">
                    {n.body}
                  </Link>
                ) : (
                  n.body
                )}
              </p>
              <p className="text-xs text-umi-muted">{n.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
