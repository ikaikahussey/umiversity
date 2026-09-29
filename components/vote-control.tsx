"use client";
import { useActionState } from "react";
import { voteAction } from "@/app/actions/discussion";
import type { ActionState } from "@/lib/action";

type Props = { targetType: "thread" | "post" | "resource"; targetId: string; score: number; myVote: number; returnTo: string; canVote: boolean };

export function VoteControl({ targetType, targetId, score, myVote, returnTo, canVote }: Props) {
  const [state, action, pending] = useActionState<ActionState, FormData>(voteAction, null);
  const shown = typeof state?.data === "number" ? state.data : score;
  const btn = (v: 1 | -1, label: string) => {
    const active = myVote === v;
    return (
      <button
        type="submit"
        name="value"
        value={active ? 0 : v}
        disabled={!canVote || pending}
        aria-label={`${label}${active ? " (undo)" : ""}`}
        aria-pressed={active}
        className={`px-1 text-sm leading-none ${active ? "text-umi-teal" : "text-umi-muted"} disabled:opacity-40`}
      >
        {v === 1 ? "▲" : "▼"}
      </button>
    );
  };
  return (
    <form action={action} className="flex w-8 flex-col items-center" title={state?.error}>
      <input type="hidden" name="targetType" value={targetType} />
      <input type="hidden" name="targetId" value={targetId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {btn(1, "Upvote")}
      <span className="umi-label text-sm" data-testid={`score-${targetId}`}>
        {shown}
      </span>
      {btn(-1, "Downvote")}
      {state?.error && <span className="sr-only" role="alert">{state.error}</span>}
    </form>
  );
}
