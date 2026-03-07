"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { Copy, Check } from "lucide-react";
import { CodeExecutor } from "./code-executor";
import { ImageLightbox } from "./image-lightbox";
import type { ComponentProps } from "react";

// Allow className on code/span/pre for syntax highlighting
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className"],
    img: [...(defaultSchema.attributes?.img ?? []), "alt", "title"],
  },
};

interface MarkdownContentProps {
  content: string;
  highlightQuery?: string;
  mentionNames?: string[];
  /** When true, skip DOM-based highlighting to avoid React reconciliation crashes during rapid updates. */
  streaming?: boolean;
}

function CodeBlockCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [code]);

  return (
    <button
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-md bg-accent p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground/80 group-hover/code:opacity-100"
      title="Copy code"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function extractTextFromChildren(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextFromChildren).join("");
  if (children && typeof children === "object" && "props" in children) {
    return extractTextFromChildren((children as React.ReactElement<{ children?: React.ReactNode }>).props.children);
  }
  return "";
}

/**
 * Extract the language from a code block's className.
 * rehype-highlight adds classes like "hljs language-javascript".
 * ReactMarkdown also adds "language-js" from the markdown fence.
 */
function extractLanguageFromChildren(children: React.ReactNode): string | null {
  if (children && typeof children === "object" && "props" in children) {
    const element = children as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
    const className = element.props.className ?? "";
    const match = className.match(/language-(\w+)/);
    return match ? match[1] : null;
  }
  return null;
}

const JS_LANGUAGES = new Set(["javascript", "js"]);

/**
 * Normalize markdown content for reliable GFM table parsing.
 *
 * The agent's final content (via stream_end) may have different newline
 * formatting than the accumulated streaming chunks — e.g. \r\n vs \n or
 * missing blank line before a table.  When remarkGfm fails to detect the
 * table block, remarkBreaks turns the pipe/dash lines into <br>-separated
 * text, rendering the table as plain characters.
 *
 * This preprocessing ensures tables are always parseable:
 * 1. Normalize \r\n and \r → \n
 * 2. Ensure a blank line before GFM table header + delimiter rows
 * 3. Remove blank lines inserted mid-table (e.g. when plugin joins
 *    text blocks with \n\n and the split falls inside a table)
 */
export function preprocessMarkdown(raw: string): string {
  // 1. Normalize line endings
  let s = raw.replace(/\r\n?/g, "\n");

  // 2 & 3. Fix table formatting issues.
  //    Skip fenced code blocks (``` or ~~~) to avoid false positives.
  const lines = s.split("\n");
  const result: string[] = [];
  let inFence = false;
  let inTable = false;
  let tableColCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Toggle fence state on ``` or ~~~ lines
    if (/^(`{3,}|~{3,})/.test(line.trimStart())) {
      inFence = !inFence;
    }
    if (inFence) {
      inTable = false;
      result.push(line);
      continue;
    }

    // Detect table start: header row followed by delimiter row
    if (
      i >= 1 &&
      line.includes("-") &&
      line.includes("|") &&
      isTableDelimiterRow(line) &&
      lines[i - 1].includes("|")
    ) {
      // Ensure a blank line before the header row
      const headerIdx = result.length - 1;
      if (headerIdx > 0 && result[headerIdx - 1].trim() !== "") {
        result.splice(headerIdx, 0, "");
      }
      inTable = true;
      tableColCount = line.trim().replace(/^\||\|$/g, "").split("|").length;
    }

    // While inside a table, skip blank lines that break the table.
    // A blank line normally ends a GFM table, but if the next non-blank
    // line looks like a table row with the same column structure, it was
    // an accidental split — remove the blank line to keep the table intact.
    if (inTable && line.trim() === "") {
      // Look ahead for the next non-blank line
      let next = i + 1;
      while (next < lines.length && lines[next].trim() === "") next++;
      if (next < lines.length && isTableRow(lines[next], tableColCount)) {
        // Skip this blank line — it's mid-table
        continue;
      }
      // Genuine end of table
      inTable = false;
    }

    // End table if we hit a non-table-row line
    if (inTable && line.trim() !== "" && !line.trim().startsWith("|")) {
      inTable = false;
    }

    result.push(line);
  }
  return result.join("\n");
}

/** Returns true if the line looks like a table data row with the expected column count */
function isTableRow(line: string, expectedCols: number): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return false;
  const cols = trimmed.replace(/^\||\|$/g, "").split("|").length;
  return cols === expectedCols;
}

/** Returns true if every pipe-separated cell matches the GFM delimiter pattern :?-+:? */
function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim().replace(/^\||\|$/g, "");
  const cells = trimmed.split("|");
  return cells.length > 0 && cells.every((c) => /^\s*:?-{1,}:?\s*$/.test(c));
}

/**
 * Custom remark plugin: strip `break` nodes inside `table` elements.
 * remark-breaks converts single \n to <br>, but table rows use \n as
 * structural delimiters — the extra <br> breaks table rendering.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripBreaksFromNode(node: any): void {
  if (!node.children) return;
  node.children = node.children.filter((child: { type: string }) => child.type !== "break");
  for (const child of node.children) stripBreaksFromNode(child);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findTables(node: any): void {
  if (node.type === "table") { stripBreaksFromNode(node); return; }
  if (node.children) for (const child of node.children) findTables(child);
}
function remarkStripTableBreaks() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => findTables(tree);
}

// Stable plugin arrays — avoid re-creating on every render
const remarkPluginList = [remarkGfm, remarkBreaks, remarkStripTableBreaks];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rehypePluginList: any[] = [rehypeHighlight, [rehypeSanitize, sanitizeSchema]];

// Stable components object — prevents React from unmounting/remounting
// markdown elements on every render (which causes image flicker during streaming).
const markdownComponents = {
  img(props: ComponentProps<"img">) {
    const src = typeof props.src === "string" ? props.src : undefined;
    if (!src) return null;
    return <ImageLightbox src={src} alt={typeof props.alt === "string" ? props.alt : undefined} />;
  },
  table(props: ComponentProps<"table">) {
    return (
      <div className="my-2 overflow-x-auto rounded-md border border-border">
        <table {...props} className="min-w-full border-collapse text-sm" />
      </div>
    );
  },
  thead(props: ComponentProps<"thead">) {
    return <thead {...props} className="bg-muted/50" />;
  },
  th(props: ComponentProps<"th">) {
    return <th {...props} className="border-b border-border px-3 py-2 text-left font-semibold whitespace-nowrap" />;
  },
  td(props: ComponentProps<"td">) {
    return <td {...props} className="border-b border-border/50 px-3 py-1.5" />;
  },
  pre(props: ComponentProps<"pre">) {
    const { children, ...rest } = props;
    const codeText = extractTextFromChildren(children).trim();
    const language = extractLanguageFromChildren(children);
    const isExecutable = language !== null && JS_LANGUAGES.has(language);

    const codeBlock = (
      <div className="group/code relative">
        <pre {...rest}>{children}</pre>
        {codeText && <CodeBlockCopyButton code={codeText} />}
      </div>
    );

    if (isExecutable && codeText) {
      return (
        <CodeExecutor code={codeText}>
          {codeBlock}
        </CodeExecutor>
      );
    }

    return codeBlock;
  },
};

export function MarkdownContent({ content, highlightQuery, mentionNames, streaming }: MarkdownContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  // Highlight matching search text in the DOM after render
  useEffect(() => {
    const el = contentRef.current;
    if (!highlightQuery || !el || streaming) return;

    const lowerQ = highlightQuery.toLowerCase();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const matches: { node: Text; start: number; end: number }[] = [];
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent ?? "";
      let idx = text.toLowerCase().indexOf(lowerQ);
      while (idx >= 0) {
        matches.push({ node: textNode, start: idx, end: idx + highlightQuery.length });
        idx = text.toLowerCase().indexOf(lowerQ, idx + 1);
      }
    }

    // Wrap matches in <mark> (reverse order to keep offsets valid)
    for (let i = matches.length - 1; i >= 0; i--) {
      const { node, start, end } = matches[i];
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const mark = document.createElement("mark");
      mark.className = "search-keyword-highlight";
      range.surroundContents(mark);
    }

    return () => {
      // Clean up marks before next render / unmount
      if (!contentRef.current) return;
      const marks = contentRef.current.querySelectorAll("mark.search-keyword-highlight");
      marks.forEach((m) => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent ?? ""), m);
          parent.normalize();
        }
      });
    };
  }, [highlightQuery, content, streaming]);

  // Highlight @mentions in the DOM after render
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !mentionNames?.length || streaming) return;

    const escapedNames = mentionNames.map((n) =>
      n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    );
    const pattern = new RegExp(`@(${escapedNames.join("|")})(?:\\b|$)`);
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const matches: { node: Text; start: number; end: number }[] = [];
    let textNode: Text | null;
    while ((textNode = walker.nextNode() as Text | null)) {
      const text = textNode.textContent ?? "";
      let offset = 0;
      while (offset < text.length) {
        const sub = text.slice(offset);
        const match = sub.match(pattern);
        if (!match || match.index === undefined) break;
        matches.push({
          node: textNode,
          start: offset + match.index,
          end: offset + match.index + match[0].length,
        });
        offset += match.index + match[0].length;
      }
    }

    for (let i = matches.length - 1; i >= 0; i--) {
      const { node, start, end } = matches[i];
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const span = document.createElement("span");
      span.setAttribute("data-mention", "true");
      span.className = "font-semibold text-blue-400";
      range.surroundContents(span);
    }

    return () => {
      if (!contentRef.current) return;
      const spans = contentRef.current.querySelectorAll("[data-mention]");
      spans.forEach((s) => {
        const parent = s.parentNode;
        if (parent) {
          parent.replaceChild(
            document.createTextNode(s.textContent ?? ""),
            s
          );
          parent.normalize();
        }
      });
    };
  }, [mentionNames, content, streaming]);

  return (
    <div ref={contentRef} className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={remarkPluginList}
        rehypePlugins={rehypePluginList}
        components={markdownComponents}
      >
        {preprocessMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
