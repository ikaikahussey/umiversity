import Link from "next/link";
import { addResourceAction, createThreadAction } from "@/app/actions/discussion";
import { ActionForm } from "./action-form";
import { Field, inputCls, Pill } from "./ui";
import { VoteControl } from "./vote-control";

type ThreadRow = {
  id: string;
  title: string;
  score: number;
  acceptedPostId: string | null;
  answers: number;
  authorHandle: string;
};

export function ThreadList({ courseSlug, threads }: { courseSlug: string; threads: ThreadRow[] }) {
  if (threads.length === 0) return <p className="text-sm text-muted">No questions yet.</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="thread-list">
      {threads.map((t) => (
        <li key={t.id} className="flex items-center gap-3 text-sm">
          <span className="w-8 text-center font-semibold">{t.score}</span>
          <Link href={`/c/${courseSlug}/q/${t.id}`} className="flex-1 text-accent">
            {t.title}
          </Link>
          {t.acceptedPostId && <Pill tone="accent">answered</Pill>}
          <span className="text-xs text-muted">
            {t.answers} {t.answers === 1 ? "answer" : "answers"} · @{t.authorHandle}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ScopeProps = { courseId: string; courseSlug: string; unitId?: string; lessonId?: string; returnTo: string };

function ScopeInputs({ courseId, courseSlug, unitId, lessonId, returnTo }: ScopeProps) {
  return (
    <>
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="courseSlug" value={courseSlug} />
      {unitId && <input type="hidden" name="unitId" value={unitId} />}
      {lessonId && <input type="hidden" name="lessonId" value={lessonId} />}
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );
}

export function NewThreadForm(props: ScopeProps) {
  return (
    <details className="rounded border border-line bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">Ask a question</summary>
      <div className="mt-3">
        <ActionForm action={createThreadAction} submitLabel="Post question" testId="new-thread">
          <ScopeInputs {...props} />
          <Field label="Question title">
            <input name="title" required minLength={5} maxLength={200} className={inputCls} />
          </Field>
          <Field label="Details (Markdown)">
            <textarea name="bodyMd" required rows={4} className={inputCls} />
          </Field>
        </ActionForm>
      </div>
    </details>
  );
}

type ResourceRow = {
  resource: { id: string; url: string; title: string; type: string; level: string; score: number; addedById: string | null; partnerId: string | null };
  myVote: number | null;
};

export function ResourceList({ rows, returnTo, viewerId }: { rows: ResourceRow[]; returnTo: string; viewerId?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No resources yet.</p>;
  return (
    <ul className="flex flex-col gap-2" data-testid="resource-list">
      {rows.map(({ resource: r, myVote }) => (
        <li key={r.id} className="flex items-center gap-3">
          <VoteControl
            targetType="resource"
            targetId={r.id}
            score={r.score}
            myVote={myVote ?? 0}
            returnTo={returnTo}
            canVote={Boolean(viewerId) && viewerId !== r.addedById}
          />
          <div className="flex-1 text-sm">
            <a href={`/go/${r.id}`} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline">
              {r.title}
            </a>
            <div className="mt-0.5 flex gap-1">
              <Pill>{r.type}</Pill>
              <Pill>{r.level}</Pill>
              {r.partnerId && <Pill tone="warn">affiliate</Pill>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function AddResourceForm(props: ScopeProps) {
  return (
    <details className="rounded border border-line bg-card p-3">
      <summary className="cursor-pointer text-sm font-medium">Add a resource</summary>
      <div className="mt-3">
        <ActionForm action={addResourceAction} submitLabel="Add link" resetOnSuccess testId="add-resource">
          <ScopeInputs {...props} />
          <Field label="URL">
            <input name="url" type="url" required placeholder="https://" className={inputCls} />
          </Field>
          <Field label="Link title">
            <input name="title" required className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select name="type" className={inputCls} defaultValue="">
                <option value="">Detect</option>
                {["video", "course", "article", "book", "archive", "audio", "other"].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Level">
              <select name="level" className={inputCls}>
                <option value="beginner">beginner</option>
                <option value="intermediate">intermediate</option>
                <option value="advanced">advanced</option>
              </select>
            </Field>
          </div>
        </ActionForm>
      </div>
    </details>
  );
}
