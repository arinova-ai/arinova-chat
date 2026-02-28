import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("./code-executor", () => ({
  CodeExecutor: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="code-executor">{children}</div>
  ),
}));

import { MarkdownContent, preprocessMarkdown } from "./markdown-content";

describe("MarkdownContent", () => {
  it("renders plain text content", () => {
    render(<MarkdownContent content="Hello, world!" />);
    expect(screen.getByText("Hello, world!")).toBeInTheDocument();
  });

  it("renders bold markdown correctly", () => {
    const { container } = render(<MarkdownContent content="This is **bold** text" />);
    const strong = container.querySelector("strong");
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe("bold");
  });

  it("renders italic markdown correctly", () => {
    const { container } = render(<MarkdownContent content="This is _italic_ text" />);
    const em = container.querySelector("em");
    expect(em).toBeInTheDocument();
    expect(em?.textContent).toBe("italic");
  });

  it("renders code blocks with <pre> elements", () => {
    const { container } = render(
      <MarkdownContent content={"```\nconst x = 1;\n```"} />
    );
    const pre = container.querySelector("pre");
    expect(pre).toBeInTheDocument();
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownContent content="Use `console.log()` for debugging" />);
    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code?.textContent).toBe("console.log()");
  });

  it("XSS: does NOT render a script tag from content", () => {
    const { container } = render(
      <MarkdownContent content='<script>alert("xss")</script>' />
    );
    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(0);
  });

  it("XSS: img with onerror renders without the onerror attribute", () => {
    const { container } = render(
      <MarkdownContent content='<img onerror="alert(1)" src="x">' />
    );
    const img = container.querySelector("img");
    // If the img is rendered at all, it must not have onerror
    if (img) {
      expect(img.getAttribute("onerror")).toBeNull();
    } else {
      // img was sanitized away entirely — also acceptable
      expect(container.querySelectorAll("img")).toHaveLength(0);
    }
  });

  it("XSS: does not execute inline event handlers from raw HTML", () => {
    const { container } = render(
      <MarkdownContent content='<a href="javascript:alert(1)">click me</a>' />
    );
    const anchors = container.querySelectorAll("a");
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") ?? "";
      expect(href.toLowerCase()).not.toContain("javascript:");
    }
  });
});

describe("preprocessMarkdown", () => {
  it("normalizes \\r\\n to \\n", () => {
    const result = preprocessMarkdown("line1\r\nline2\r\nline3");
    expect(result).toBe("line1\nline2\nline3");
  });

  it("preserves content without \\r\\n unchanged", () => {
    const input = "hello\nworld";
    expect(preprocessMarkdown(input)).toBe(input);
  });

  it("inserts blank line before GFM table when missing", () => {
    const input = "Some text\n| Header | Col |\n| --- | --- |\n| A | B |";
    const result = preprocessMarkdown(input);
    expect(result).toContain("\n\n| Header | Col |");
  });

  it("does not double-insert blank line if already present", () => {
    const input = "Some text\n\n| Header | Col |\n| --- | --- |\n| A | B |";
    const result = preprocessMarkdown(input);
    // Should not have triple newline
    expect(result).not.toContain("\n\n\n");
  });

  it("handles multiple tables", () => {
    const input =
      "Table 1:\n| A | B |\n| --- | --- |\n| 1 | 2 |\nTable 2:\n| C | D |\n| --- | --- |\n| 3 | 4 |";
    const result = preprocessMarkdown(input);
    expect(result).toContain("\n\n| A | B |");
    expect(result).toContain("\n\n| C | D |");
  });

  it("does not modify pipes inside fenced code blocks", () => {
    const input = "```\n| not | a | table |\n| --- | --- | --- |\n```";
    const result = preprocessMarkdown(input);
    // Should remain unchanged — no blank lines inserted inside fence
    expect(result).toBe(input);
  });

  it("handles table with alignment markers (:---:, ---:)", () => {
    const input = "text\n| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |";
    const result = preprocessMarkdown(input);
    expect(result).toContain("\n\n| Left | Center | Right |");
  });
});
