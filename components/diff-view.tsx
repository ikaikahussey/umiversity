import { diffLines } from "@/lib/diff";

export function DiffView({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after);
  return (
    <pre className="max-h-80 overflow-auto rounded border border-umi-line bg-umi-paper p-2 text-xs" data-testid="diff">
      {lines.map((l, i) => (
        <div
          key={i}
          className={l.op === "add" ? "bg-green-50 text-green-800" : l.op === "del" ? "bg-red-50 text-red-800" : ""}
        >
          {l.op === "add" ? "+ " : l.op === "del" ? "- " : "  "}
          {l.text}
        </div>
      ))}
    </pre>
  );
}
