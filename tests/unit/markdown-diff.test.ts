import { describe, expect, it } from "vitest";
import { diffLines, diffStats } from "@/lib/diff";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown", () => {
  it("renders headings, lists, emphasis and code", () => {
    const html = renderMarkdown("# Aloha\n\nSay **mahalo** and *a hui hou*.\n\n- ʻekahi\n- ʻelua\n\n1. one\n2. two\n\n`code`");
    expect(html).toContain("<h1>Aloha</h1>");
    expect(html).toContain("<strong>mahalo</strong>");
    expect(html).toContain("<em>a hui hou</em>");
    expect(html).toContain("<ul><li>ʻekahi</li><li>ʻelua</li></ul>");
    expect(html).toContain("<ol><li>one</li><li>two</li></ol>");
    expect(html).toContain("<code>code</code>");
  });

  it("escapes raw HTML", () => {
    const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror="y">');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("allows only safe link targets", () => {
    expect(renderMarkdown("[ok](https://example.org/a?b=1&c=2)")).toContain(
      '<a href="https://example.org/a?b=1&amp;c=2" rel="nofollow noopener noreferrer">ok</a>',
    );
    expect(renderMarkdown("[x](javascript:alert(1))")).not.toContain("href");
    expect(renderMarkdown("[x](//evil.com)")).not.toContain("href");
    expect(renderMarkdown("[rel](/c/olelo-hawaii)")).toContain('href="/c/olelo-hawaii"');
  });

  it("keeps code blocks literal", () => {
    expect(renderMarkdown("```\n**not bold** <b>\n```")).toBe("<pre><code>**not bold** &lt;b&gt;</code></pre>");
  });

  it("renders blockquotes", () => {
    expect(renderMarkdown("> ʻŌlelo noʻeau")).toBe("<blockquote>ʻŌlelo noʻeau</blockquote>");
  });
});

describe("diffLines", () => {
  it("marks additions and deletions", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(d).toEqual([
      { op: "same", text: "a" },
      { op: "del", text: "b" },
      { op: "add", text: "B" },
      { op: "same", text: "c" },
      { op: "add", text: "d" },
    ]);
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 });
  });

  it("handles empty sides", () => {
    expect(diffLines("", "x")).toEqual([{ op: "add", text: "x" }]);
    expect(diffLines("x", "")).toEqual([{ op: "del", text: "x" }]);
    expect(diffLines("", "")).toEqual([]);
  });
});
