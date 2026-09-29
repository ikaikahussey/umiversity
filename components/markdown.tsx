import { renderMarkdown } from "@/lib/markdown";

/** Renders escaped, sanitized Markdown (see lib/markdown.ts). */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return <div className={`prose-lesson ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
