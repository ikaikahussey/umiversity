"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { submitRequestAction, type SubmitRequestState } from "@/app/actions/requests";
import { Field, inputCls } from "./ui";

type FieldOption = { id: string; name: string; domain: string };

export function RequestForm({ fields }: { fields: FieldOption[] }) {
  const [state, action, pending] = useActionState<SubmitRequestState, FormData>(submitRequestAction, null);
  const matches = state?.matches ?? [];
  // Controlled inputs so values survive the duplicate check round-trip (forms reset after actions).
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fieldId, setFieldId] = useState("");
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="request-form">
      <Field label="Course title">
        <input name="title" required minLength={3} maxLength={120} className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Description" hint="One paragraph: what the course should cover and who it is for.">
        <textarea name="description" required minLength={20} maxLength={1200} rows={4} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Field">
        <select name="fieldId" required className={inputCls} value={fieldId} onChange={(e) => setFieldId(e.target.value)}>
          <option value="" disabled>
            Choose a field
          </option>
          {fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.domain} — {f.name}
            </option>
          ))}
        </select>
      </Field>
      {matches.length > 0 && (
        <div className="rounded-md border-2 border-umi-gold bg-umi-gold-tint p-3 text-sm" data-testid="duplicates">
          <p className="font-medium">Possible duplicates:</p>
          <ul className="ml-4 list-disc">
            {matches.map((m) => (
              <li key={`${m.kind}-${m.id}`}>
                <Link href={m.href} className="text-umi-teal underline">
                  {m.title}
                </Link>{" "}
                <span className="text-xs text-umi-muted">({m.kind})</span>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="confirmNotDuplicate" /> My request is different
          </label>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="umi-btn">
          {pending ? "Checking…" : "Submit request"}
        </button>
        {state?.error && (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
