import Link from "next/link";
import { redirect } from "next/navigation";
import { updateProfileAction } from "@/app/actions/profile";
import { ActionForm } from "@/components/action-form";
import { Card, Field, inputCls, PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/session";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in");
  return (
    <main className="flex flex-col gap-4">
      <PageTitle
        sub={
          <span className="flex gap-4">
            <Link href="/settings/badges" className="text-umi-teal">Badges and credentials →</Link>
            <Link href="/settings/payouts" className="text-umi-teal">Points and payouts →</Link>
          </span>
        }
      >
        Settings
      </PageTitle>
      <Card>
        <ActionForm action={updateProfileAction} submitLabel="Save" testId="profile-form">
          <Field label="Handle">
            <input name="handle" defaultValue={user.handle} className={inputCls} />
          </Field>
          <Field label="Name">
            <input name="name" defaultValue={user.name} className={inputCls} />
          </Field>
          <Field label="Bio">
            <textarea name="bio" defaultValue={user.bio ?? ""} rows={3} className={inputCls} />
          </Field>
          <Field label="Timezone" hint="IANA name, e.g. Pacific/Honolulu">
            <input name="timezone" defaultValue={user.timezone} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weekly goal type">
              <select name="weeklyGoalType" defaultValue={user.weeklyGoalType} className={inputCls}>
                <option value="lessons">Lessons</option>
                <option value="minutes">Minutes</option>
              </select>
            </Field>
            <Field label="Weekly goal target">
              <input name="weeklyGoalTarget" type="number" min={1} defaultValue={user.weeklyGoalTarget} className={inputCls} />
            </Field>
          </div>
          <Field label="Daily reminder hour (local, 0-23; blank for none)">
            <input name="reminderHour" type="number" min={0} max={23} defaultValue={user.reminderHour ?? ""} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="notifyEmail" defaultChecked={user.notifyEmail} /> Email reminders
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="digestEmail" defaultChecked={user.digestEmail} /> Weekly digest email
          </label>
        </ActionForm>
      </Card>
    </main>
  );
}
